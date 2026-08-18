import {
  GAME_NAMES,
  SUITS,
  createGame,
  sanitizeState,
  pokerAction,
  drawCards,
  blackjackBet,
  blackjackInsurance,
  blackjackAction,
  nextHand,
  addChips,
  cardText,
  blackjackTotal
} from "./engine.js";

const MODULE_ID = "saltybananaslug-card-games";
const LOG_PREFIX = "SaltyBananaSlug's Card Games";
const MAX_SEATS = { holdem: 10, draw: 8, blackjack: 7 };
const MIN_SEATS = { holdem: 2, draw: 2, blackjack: 1 };

let socket = null;
let authorityLoaded = false;
const authority = { lobbies: new Map(), games: new Map() };
const local = {
  views: new Map(),
  windows: new Map(),
  lobbyPanels: new Map(),
  drawSelections: new Map(),
  pendingDeclinePrompts: new Set()
};

function esc(value) {
  const text = String(value ?? "");
  return globalThis.foundry?.utils?.escapeHTML
    ? foundry.utils.escapeHTML(text)
    : text.replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

function randomId(length = 16) {
  if (globalThis.foundry?.utils?.randomID) return foundry.utils.randomID(length);
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function authorityStorageKey() {
  return `${MODULE_ID}.authority.${game.world?.id ?? "world"}`;
}

function saveAuthority() {
  if (!game.user?.isGM || !authorityLoaded) return;
  try {
    const data = {
      savedAt: Date.now(),
      lobbies: [...authority.lobbies.values()].map(lobby => ({
        ...lobby,
        invitedUserIds: [...lobby.invitedUserIds],
        responses: [...lobby.responses.entries()],
        seatsByUser: [...lobby.seatsByUser.entries()]
      })),
      games: [...authority.games.values()]
    };
    localStorage.setItem(authorityStorageKey(), JSON.stringify(data));
  } catch (error) {
    console.warn(`${LOG_PREFIX} | Could not save active tables`, error);
  }
}

function loadAuthority() {
  if (!game.user?.isGM || authorityLoaded) return;
  authorityLoaded = true;
  try {
    const raw = localStorage.getItem(authorityStorageKey());
    if (!raw) return;
    const data = JSON.parse(raw);
    authority.lobbies.clear();
    authority.games.clear();
    for (const lobby of data.lobbies ?? []) {
      lobby.responses = new Map(lobby.responses ?? []);
      lobby.seatsByUser = new Map(lobby.seatsByUser ?? []);
      authority.lobbies.set(lobby.id, lobby);
    }
    for (const state of data.games ?? []) authority.games.set(state.id, state);
    if (authority.games.size || authority.lobbies.size) {
      console.log(`${LOG_PREFIX} | Restored ${authority.games.size} active table(s) and ${authority.lobbies.size} lobby/lobbies.`);
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} | Could not restore active tables`, error);
  }
}

function activeUsers() {
  return game.users.filter(user => user.active);
}

function activeGMs() {
  return activeUsers().filter(user => user.isGM);
}

function isRequesterGM(userId) {
  return Boolean(game.users.get(userId)?.isGM);
}

function gameIcon() {
  return `modules/${MODULE_ID}/assets/banana-slug.svg`;
}

function notify(level, message) {
  const fn = ui.notifications?.[level] ?? ui.notifications?.info;
  fn?.call(ui.notifications, message);
}

function gameLabel(type) {
  return GAME_NAMES[type] ?? type;
}

function formatRound(view) {
  const labels = {
    preflop: "Pre-Flop", flop: "Flop", turn: "Turn", river: "River",
    "first-bet": "First Betting Round", draw: "Draw", "second-bet": "Final Betting Round",
    betting: "Place Bets", insurance: "Insurance", players: "Players", dealer: "Dealer", settlement: "Results"
  };
  return labels[view.round] ?? String(view.round ?? view.phase ?? "");
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showPrompt({ title, content, buttons, width = 520, closeValue = null, classes = "" }) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "sbs-cg-modal-overlay";
    overlay.innerHTML = `
      <section class="sbs-cg-modal ${classes}" style="--sbs-modal-width:${Number(width)}px">
        <header><img src="${gameIcon()}" alt=""><h2>${esc(title)}</h2><button type="button" class="sbs-cg-x" aria-label="Close">×</button></header>
        <form>
          <div class="sbs-cg-modal-body">${content}</div>
          <footer>${buttons.map((button, index) => `<button type="button" data-button="${index}" class="${esc(button.className ?? "")}">${esc(button.label)}</button>`).join("")}</footer>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    let finished = false;
    const finish = value => {
      if (finished) return;
      finished = true;
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector(".sbs-cg-x").addEventListener("click", () => finish(closeValue));
    overlay.addEventListener("mousedown", event => {
      if (event.target === overlay) finish(closeValue);
    });
    overlay.querySelectorAll("[data-button]").forEach(element => {
      element.addEventListener("click", async () => {
        const button = buttons[Number(element.dataset.button)];
        try {
          const value = button.callback ? await button.callback(form, overlay) : button.value;
          if (value !== undefined) finish(value);
        } catch (error) {
          notify("error", error.message || String(error));
        }
      });
    });
    queueMicrotask(() => overlay.querySelector("input,select,button")?.focus());
  });
}

async function chooseGame() {
  return showPrompt({
    title: "Choose a Card Game",
    width: 650,
    content: `
      <p class="sbs-cg-intro">What flavor of financially irresponsible tavern behavior are we committing to?</p>
      <div class="sbs-cg-game-picker">
        <button type="button" data-game-choice="holdem"><strong>Texas Hold'em</strong><span>Two private cards, five community cards, blinds, four betting rounds.</span></button>
        <button type="button" data-game-choice="draw"><strong>Five-Card Draw</strong><span>Five private cards, one draw, two betting rounds, classic saloon nonsense.</span></button>
        <button type="button" data-game-choice="blackjack"><strong>Blackjack</strong><span>Play against the dealer with bets, splits, doubles, insurance, and surrender.</span></button>
      </div>`,
    buttons: [{ label: "Cancel", value: null }],
    closeValue: null,
    classes: "sbs-cg-game-choice-modal"
  }).then(result => result);
}

// Game-choice buttons live in the modal body, so wrap the generic prompt with delegated resolution.
async function chooseGameFixed() {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "sbs-cg-modal-overlay";
    overlay.innerHTML = `
      <section class="sbs-cg-modal sbs-cg-game-choice-modal" style="--sbs-modal-width:650px">
        <header><img src="${gameIcon()}" alt=""><h2>Choose a Card Game</h2><button type="button" class="sbs-cg-x">×</button></header>
        <div class="sbs-cg-modal-body">
          <p class="sbs-cg-intro">What flavor of financially irresponsible tavern behavior are we committing to?</p>
          <div class="sbs-cg-game-picker">
            <button type="button" data-game-choice="holdem"><strong>Texas Hold'em</strong><span>Two private cards, five community cards, blinds, four betting rounds.</span></button>
            <button type="button" data-game-choice="draw"><strong>Five-Card Draw</strong><span>Five private cards, one draw, two betting rounds, classic saloon nonsense.</span></button>
            <button type="button" data-game-choice="blackjack"><strong>Blackjack</strong><span>Play against the dealer with bets, splits, doubles, insurance, and surrender.</span></button>
          </div>
        </div>
        <footer><button type="button" data-cancel>Cancel</button></footer>
      </section>`;
    document.body.appendChild(overlay);
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelectorAll("[data-game-choice]").forEach(button => button.addEventListener("click", () => finish(button.dataset.gameChoice)));
    overlay.querySelector(".sbs-cg-x").addEventListener("click", () => finish(null));
    overlay.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
  });
}

async function choosePlayers(type) {
  const users = activeUsers();
  const rows = users.map(user => {
    const self = user.id === game.user.id;
    return `<label class="sbs-cg-user-row">
      <input type="checkbox" name="user-${esc(user.id)}" value="${esc(user.id)}" ${self ? "checked disabled" : ""}>
      <span class="sbs-cg-user-dot" style="background:${esc(user.color ?? "#777")}"></span>
      <strong>${esc(user.name)}</strong>
      <small>${user.isGM ? "Gamemaster — may choose NPC seats" : "Player"}${self ? " · You" : ""}</small>
    </label>`;
  }).join("");
  return showPrompt({
    title: `Invite Players — ${gameLabel(type)}`,
    content: `<p>Choose connected users to invite. You are included automatically.</p><div class="sbs-cg-user-list">${rows}</div><p class="hint">Maximum seats: ${MAX_SEATS[type]}. A GM controlling multiple NPCs uses one seat per NPC.</p>`,
    buttons: [
      { label: "Back", value: "back" },
      {
        label: "Continue", className: "primary", callback: form => {
          const ids = [game.user.id];
          form.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)').forEach(input => ids.push(input.value));
          const unique = [...new Set(ids)];
          if (unique.length > MAX_SEATS[type]) throw new Error(`${gameLabel(type)} supports at most ${MAX_SEATS[type]} connected users before NPC seats are added.`);
          return unique;
        }
      }
    ]
  });
}

async function chooseSettings(type) {
  let fields;
  if (type === "holdem") {
    fields = `
      <label>Starting chips <input name="startingChips" type="number" min="100" step="10" value="1000"></label>
      <label>Small blind <input name="smallBlind" type="number" min="1" step="1" value="10"></label>
      <label>Big blind <input name="bigBlind" type="number" min="2" step="1" value="20"></label>`;
  } else if (type === "draw") {
    fields = `
      <label>Starting chips <input name="startingChips" type="number" min="100" step="10" value="1000"></label>
      <label>Ante <input name="ante" type="number" min="0" step="1" value="10"></label>
      <label>Minimum opening bet <input name="minBet" type="number" min="1" step="1" value="20"></label>
      <label>Maximum cards drawn <input name="maxDraw" type="number" min="1" max="4" step="1" value="3"></label>`;
  } else {
    fields = `
      <label>Starting chips <input name="startingChips" type="number" min="50" step="10" value="500"></label>
      <label>Minimum bet <input name="minBet" type="number" min="1" step="1" value="10"></label>
      <label>Maximum bet <input name="maxBet" type="number" min="10" step="10" value="500"></label>
      <label class="sbs-cg-check"><input name="dealerHitsSoft17" type="checkbox"> Dealer hits soft 17</label>`;
  }
  return showPrompt({
    title: `Table Rules — ${gameLabel(type)}`,
    content: `<div class="sbs-cg-settings-grid">${fields}</div>`,
    buttons: [
      { label: "Back", value: "back" },
      {
        label: "Continue", className: "primary", callback: form => {
          const raw = formValues(form);
          const settings = {};
          for (const [key, value] of Object.entries(raw)) {
            if (key === "dealerHitsSoft17") continue;
            settings[key] = Math.floor(Number(value));
            if (!Number.isFinite(settings[key])) throw new Error("Every table setting needs a valid number.");
          }
          if (type === "holdem" && settings.bigBlind < settings.smallBlind) throw new Error("The big blind cannot be smaller than the small blind. Even goblins know this.");
          if (type === "blackjack" && settings.maxBet < settings.minBet) throw new Error("Maximum bet must be at least the minimum bet.");
          if (type === "blackjack") settings.dealerHitsSoft17 = form.elements.dealerHitsSoft17.checked;
          return settings;
        }
      }
    ]
  });
}

function ordinarySeatForUser(user) {
  return [{ id: randomId(), ownerUserId: user.id, name: user.name, actorId: null, avatar: user.avatar ?? null }];
}

async function chooseGMSeats(type, user = game.user) {
  const actors = game.actors.contents
    .filter(actor => actor.type === "npc" || actor.type === "monster" || actor.type === "vehicle")
    .sort((a, b) => a.name.localeCompare(b.name));
  const options = actors.length
    ? actors.map(actor => `<option value="${esc(actor.id)}">${esc(actor.name)} (${esc(actor.type)})</option>`).join("")
    : `<option disabled>No NPC actors found</option>`;
  return showPrompt({
    title: `Choose the GM's Seats — ${gameLabel(type)}`,
    width: 620,
    content: `
      <p>Select any NPCs the GM will play. Ctrl-click to select several. With none selected, the seat is simply <strong>The DM</strong>.</p>
      <select name="actors" multiple size="12" class="sbs-cg-actor-select">${options}</select>
      <label class="sbs-cg-check"><input type="checkbox" name="alsoDM"> Also add a separate seat named “The DM”</label>
      <p class="hint">The table can hold ${MAX_SEATS[type]} total seats.</p>`,
    buttons: [
      { label: "Decline", value: null },
      {
        label: "Accept", className: "primary", callback: form => {
          const selected = [...form.elements.actors.selectedOptions].map(option => game.actors.get(option.value)).filter(Boolean);
          const seats = selected.map(actor => ({
            id: randomId(), ownerUserId: user.id, name: actor.name, actorId: actor.id,
            avatar: actor.img || user.avatar || null
          }));
          if (form.elements.alsoDM.checked || seats.length === 0) {
            seats.push({ id: randomId(), ownerUserId: user.id, name: "The DM", actorId: null, avatar: user.avatar ?? null });
          }
          return seats;
        }
      }
    ]
  });
}

async function launchGame() {
  if (!await ensureSocket({ notifyUser: true })) return;
  if (!activeGMs().length) {
    notify("warn", "A connected GM is required to deal and protect private hands.");
    return;
  }

  let type = await chooseGameFixed();
  if (!type) return;
  let invitedUserIds = await choosePlayers(type);
  if (!invitedUserIds) return;
  if (invitedUserIds === "back") return launchGame();
  let settings = await chooseSettings(type);
  if (!settings) return;
  if (settings === "back") return launchGame();

  let hostSeats;
  if (game.user.isGM) {
    hostSeats = await chooseGMSeats(type);
    if (!hostSeats) return;
  } else {
    hostSeats = ordinarySeatForUser(game.user);
  }

  try {
    await socket.executeAsGM("authorityRequest", "createLobby", {
      requesterId: game.user.id,
      type,
      invitedUserIds,
      settings,
      hostSeats
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} | Failed to create lobby`, error);
    notify("error", error.message || String(error));
  }
}

async function sendAuthority(action, payload) {
  if (!await ensureSocket({ notifyUser: false })) throw new Error(socketFailureMessage());
  return socket.executeAsGM("authorityRequest", action, { ...payload, requesterId: game.user.id });
}

async function pushUser(userId, event) {
  if (!await ensureSocket({ notifyUser: false })) return;
  if (userId === game.user.id) return receiveEvent(event);
  return socket.executeForUsers("receiveEvent", [userId], event);
}

async function pushUsers(userIds, eventFactory) {
  for (const userId of [...new Set(userIds)]) {
    const event = typeof eventFactory === "function" ? eventFactory(userId) : eventFactory;
    await pushUser(userId, event);
  }
}

function lobbySummary(lobby) {
  return {
    id: lobby.id,
    type: lobby.type,
    gameName: gameLabel(lobby.type),
    hostUserId: lobby.hostUserId,
    hostName: game.users.get(lobby.hostUserId)?.name ?? "Unknown Host",
    invitedUserIds: [...lobby.invitedUserIds],
    responses: Object.fromEntries(lobby.responses),
    acceptedSeats: Object.fromEntries([...lobby.seatsByUser.entries()].map(([id, seats]) => [id, seats.map(seat => ({ name: seat.name, actorId: seat.actorId }))])),
    settings: lobby.settings,
    maxSeats: MAX_SEATS[lobby.type]
  };
}

function validateAuthorityRequester(payload, callerId) {
  const requesterId = payload.requesterId || callerId;
  if (!requesterId || requesterId !== callerId) throw new Error("Socket requester mismatch.");
  return requesterId;
}

async function authorityRequest(action, payload = {}) {
  if (!game.user.isGM) throw new Error("Card game authority must run on a GM client.");
  const callerId = this?.userId ?? payload.requesterId;
  const requesterId = validateAuthorityRequester(payload, callerId);

  if (action === "createLobby") return createLobbyAuthority(requesterId, payload);
  if (action === "respondInvite") return respondInviteAuthority(requesterId, payload);
  if (action === "startAccepted") return startAcceptedAuthority(requesterId, payload);
  if (action === "cancelLobby") return cancelLobbyAuthority(requesterId, payload);
  if (action === "gameAction") return gameActionAuthority(requesterId, payload);
  if (action === "requestView") return sendViewsForGame(payload.tableId, [requesterId]);
  if (action === "resumeTables") return resumeTablesAuthority(requesterId);
  if (action === "endGame") return endGameAuthority(requesterId, payload);
  throw new Error(`Unknown authority action: ${action}`);
}

function normalizeSeatDefs(seats, ownerUserId) {
  return (Array.isArray(seats) ? seats : []).map(seat => ({
    id: randomId(),
    ownerUserId,
    name: String(seat.name || game.users.get(ownerUserId)?.name || "Player").slice(0, 100),
    actorId: seat.actorId && game.actors.get(seat.actorId) ? seat.actorId : null,
    avatar: seat.avatar ? String(seat.avatar) : null
  }));
}

async function createLobbyAuthority(requesterId, payload) {
  const { type, invitedUserIds, settings, hostSeats } = payload;
  if (!GAME_NAMES[type]) throw new Error("Unknown card game.");
  const uniqueInvitees = [...new Set(invitedUserIds)].filter(id => game.users.get(id)?.active);
  if (!uniqueInvitees.includes(requesterId)) uniqueInvitees.unshift(requesterId);
  const normalizedHostSeats = normalizeSeatDefs(hostSeats, requesterId);
  if (!normalizedHostSeats.length) throw new Error("The host needs at least one seat.");
  const lobby = {
    id: randomId(), type, settings, hostUserId: requesterId,
    invitedUserIds: uniqueInvitees,
    responses: new Map([[requesterId, "accepted"]]),
    seatsByUser: new Map([[requesterId, normalizedHostSeats]]),
    createdAt: Date.now()
  };
  authority.lobbies.set(lobby.id, lobby);
  saveAuthority();

  await pushUser(requesterId, { type: "lobbyStatus", lobby: lobbySummary(lobby) });
  for (const userId of uniqueInvitees.filter(id => id !== requesterId)) {
    await pushUser(userId, { type: "invite", lobby: lobbySummary(lobby) });
  }
  if (uniqueInvitees.length === 1) await startLobbyAuthority(lobby);
  return lobby.id;
}

async function respondInviteAuthority(requesterId, payload) {
  const lobby = authority.lobbies.get(payload.lobbyId);
  if (!lobby) throw new Error("That invitation no longer exists.");
  if (!lobby.invitedUserIds.includes(requesterId)) throw new Error("You were not invited to that table.");
  if (lobby.responses.has(requesterId)) return;
  if (payload.accepted) {
    if (!Array.isArray(payload.seats) || !payload.seats.length) throw new Error("An accepted invitation needs at least one seat.");
    const normalizedSeats = normalizeSeatDefs(payload.seats, requesterId);
    if (!normalizedSeats.length) throw new Error("An accepted invitation needs at least one seat.");
    lobby.responses.set(requesterId, "accepted");
    lobby.seatsByUser.set(requesterId, normalizedSeats);
  } else {
    lobby.responses.set(requesterId, "declined");
  }
  saveAuthority();
  await pushUser(lobby.hostUserId, { type: "lobbyStatus", lobby: lobbySummary(lobby) });
  if (lobby.responses.size === lobby.invitedUserIds.length) {
    const declined = lobby.invitedUserIds.filter(id => lobby.responses.get(id) === "declined");
    if (!declined.length) await startLobbyAuthority(lobby);
    else await pushUser(lobby.hostUserId, {
      type: "declinesComplete",
      lobby: lobbySummary(lobby),
      declinedNames: declined.map(id => game.users.get(id)?.name ?? "Unknown User")
    });
  }
}

function seatsForLobby(lobby, acceptedOnly = false) {
  const groups = lobby.invitedUserIds
    .filter(userId => !acceptedOnly || lobby.responses.get(userId) === "accepted")
    .map(userId => ({ userId, seats: lobby.seatsByUser.get(userId) ?? [] }))
    .filter(group => group.seats.length);
  const seats = groups.map(group => group.seats[0]); // Every accepted user gets a seat first.
  const extras = groups.flatMap(group => group.seats.slice(1));
  return [...seats, ...extras];
}

async function startAcceptedAuthority(requesterId, payload) {
  const lobby = authority.lobbies.get(payload.lobbyId);
  if (!lobby || lobby.hostUserId !== requesterId) throw new Error("Only the host can start this lobby.");
  return startLobbyAuthority(lobby, true);
}

async function startLobbyAuthority(lobby, acceptedOnly = false) {
  let seats = seatsForLobby(lobby, acceptedOnly);
  if (seats.length < MIN_SEATS[lobby.type]) {
    await pushUser(lobby.hostUserId, { type: "lobbyError", lobbyId: lobby.id, message: `${gameLabel(lobby.type)} needs at least ${MIN_SEATS[lobby.type]} seat(s).` });
    return;
  }
  const omitted = seats.slice(MAX_SEATS[lobby.type]);
  seats = seats.slice(0, MAX_SEATS[lobby.type]);
  const tableId = randomId();
  const state = createGame(lobby.type, tableId, lobby.hostUserId, seats, lobby.settings);
  authority.games.set(tableId, state);
  authority.lobbies.delete(lobby.id);
  saveAuthority();
  const ownerIds = [...new Set(seats.map(seat => seat.ownerUserId))];
  await pushUsers(ownerIds, userId => ({ type: "gameView", view: sanitizeState(state, userId) }));
  await pushUsers(lobby.invitedUserIds, { type: "lobbyClosed", lobbyId: lobby.id });
  if (omitted.length) {
    const message = `The table limit is ${MAX_SEATS[lobby.type]}; these extra NPC seats were omitted: ${omitted.map(s => s.name).join(", ")}.`;
    await pushUser(lobby.hostUserId, { type: "warning", message });
    await pushUsers([...new Set(omitted.map(seat => seat.ownerUserId))], { type: "warning", message });
  }
}

async function cancelLobbyAuthority(requesterId, payload) {
  const lobby = authority.lobbies.get(payload.lobbyId);
  if (!lobby || lobby.hostUserId !== requesterId) throw new Error("Only the host can cancel this lobby.");
  authority.lobbies.delete(lobby.id);
  saveAuthority();
  await pushUsers(lobby.invitedUserIds, { type: "lobbyClosed", lobbyId: lobby.id, cancelled: true });
}

function verifySeatOwner(state, requesterId, seatId) {
  const seat = state.seats.find(candidate => candidate.id === seatId);
  if (!seat) throw new Error("Seat not found.");
  if (seat.ownerUserId !== requesterId) throw new Error("You do not control that seat.");
  return seat;
}

async function gameActionAuthority(requesterId, payload) {
  const state = authority.games.get(payload.tableId);
  if (!state) throw new Error("That table is no longer active.");
  const isHostOrGM = state.hostUserId === requesterId || isRequesterGM(requesterId);
  if (payload.kind === "poker") {
    verifySeatOwner(state, requesterId, payload.seatId);
    pokerAction(state, payload.seatId, payload.action, payload.amount);
  } else if (payload.kind === "draw") {
    verifySeatOwner(state, requesterId, payload.seatId);
    drawCards(state, payload.seatId, payload.indexes ?? []);
  } else if (payload.kind === "blackjack-bet") {
    verifySeatOwner(state, requesterId, payload.seatId);
    blackjackBet(state, payload.seatId, payload.amount);
  } else if (payload.kind === "blackjack-insurance") {
    verifySeatOwner(state, requesterId, payload.seatId);
    blackjackInsurance(state, payload.seatId, payload.amount);
  } else if (payload.kind === "blackjack-play") {
    verifySeatOwner(state, requesterId, payload.seatId);
    blackjackAction(state, payload.seatId, payload.action);
  } else if (payload.kind === "next-hand") {
    if (!isHostOrGM) throw new Error("Only the host or GM can begin the next hand.");
    nextHand(state);
  } else if (payload.kind === "add-chips") {
    if (!isHostOrGM) throw new Error("Only the host or GM can add chips.");
    addChips(state, payload.seatId, payload.amount);
  } else {
    throw new Error("Unknown game action.");
  }
  saveAuthority();
  await sendViewsForGame(state.id);
}

async function sendViewsForGame(tableId, onlyUserIds = null) {
  const state = authority.games.get(tableId);
  if (!state) return;
  const ownerIds = onlyUserIds ?? [...new Set(state.seats.map(seat => seat.ownerUserId))];
  await pushUsers(ownerIds, userId => ({ type: "gameView", view: sanitizeState(state, userId) }));
}

async function resumeTablesAuthority(requesterId) {
  for (const state of authority.games.values()) {
    if (state.seats.some(seat => seat.ownerUserId === requesterId)) {
      await pushUser(requesterId, { type: "gameView", view: sanitizeState(state, requesterId) });
    }
  }
  for (const lobby of authority.lobbies.values()) {
    if (lobby.hostUserId === requesterId) await pushUser(requesterId, { type: "lobbyStatus", lobby: lobbySummary(lobby) });
  }
}

async function endGameAuthority(requesterId, payload) {
  const state = authority.games.get(payload.tableId);
  if (!state) return;
  if (state.hostUserId !== requesterId && !isRequesterGM(requesterId)) throw new Error("Only the host or GM can end the table.");
  authority.games.delete(state.id);
  saveAuthority();
  const ownerIds = [...new Set(state.seats.map(seat => seat.ownerUserId))];
  await pushUsers(ownerIds, { type: "gameEnded", tableId: state.id });
}

async function receiveEvent(event) {
  try {
    if (event.type === "invite") return handleInvite(event.lobby);
    if (event.type === "lobbyStatus") return renderLobbyPanel(event.lobby);
    if (event.type === "declinesComplete") return handleDeclines(event);
    if (event.type === "lobbyClosed") return closeLobbyPanel(event.lobbyId, event.cancelled);
    if (event.type === "lobbyError") return notify("error", event.message);
    if (event.type === "warning") return notify("warn", event.message);
    if (event.type === "gameView") return updateGameView(event.view);
    if (event.type === "gameEnded") return closeGameWindow(event.tableId, true);
  } catch (error) {
    console.error(`${LOG_PREFIX} | Event handler failed`, error);
    notify("error", error.message || String(error));
  }
}

async function handleInvite(lobby) {
  const host = esc(lobby.hostName);
  let accepted = await showPrompt({
    title: `${lobby.gameName} Invitation`,
    content: `<p><strong>${host}</strong> invited you to play <strong>${esc(lobby.gameName)}</strong>.</p>${settingsSummary(lobby.type, lobby.settings)}<p>Do you accept?</p>`,
    buttons: [
      { label: "Decline", value: false },
      { label: "Accept", className: "primary", value: true }
    ],
    closeValue: false
  });
  let seats = [];
  if (accepted) {
    if (game.user.isGM) {
      seats = await chooseGMSeats(lobby.type);
      if (!seats) accepted = false;
    } else {
      seats = ordinarySeatForUser(game.user);
    }
  }
  await sendAuthority("respondInvite", { lobbyId: lobby.id, accepted, seats });
  notify("info", accepted ? `Accepted ${lobby.gameName} invitation.` : `Declined ${lobby.gameName} invitation.`);
}

function settingsSummary(type, settings) {
  if (type === "holdem") return `<div class="sbs-cg-rule-summary">Starting chips ${settings.startingChips} · Blinds ${settings.smallBlind}/${settings.bigBlind}</div>`;
  if (type === "draw") return `<div class="sbs-cg-rule-summary">Starting chips ${settings.startingChips} · Ante ${settings.ante} · Minimum bet ${settings.minBet}</div>`;
  return `<div class="sbs-cg-rule-summary">Starting chips ${settings.startingChips} · Bets ${settings.minBet}–${settings.maxBet} · Dealer ${settings.dealerHitsSoft17 ? "hits" : "stands on"} soft 17</div>`;
}

function renderLobbyPanel(lobby) {
  let panel = local.lobbyPanels.get(lobby.id);
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "sbs-cg-lobby-panel";
    panel.dataset.lobbyId = lobby.id;
    document.body.appendChild(panel);
    local.lobbyPanels.set(lobby.id, panel);
  }
  const rows = lobby.invitedUserIds.map(id => {
    const user = game.users.get(id);
    const response = lobby.responses[id] ?? "waiting";
    const seatNames = (lobby.acceptedSeats[id] ?? []).map(seat => seat.name).join(", ");
    return `<li><span>${esc(user?.name ?? "Unknown")}${seatNames ? ` <small>as ${esc(seatNames)}</small>` : ""}</span><strong class="status-${response}">${esc(response)}</strong></li>`;
  }).join("");
  panel.innerHTML = `
    <header><img src="${gameIcon()}" alt=""><div><strong>${esc(lobby.gameName)}</strong><small>Invitations</small></div></header>
    <ul>${rows}</ul>
    <button type="button" data-cancel-lobby>Cancel Game</button>`;
  panel.querySelector("[data-cancel-lobby]").addEventListener("click", () => sendAuthority("cancelLobby", { lobbyId: lobby.id }).catch(error => notify("error", error.message)));
}

function closeLobbyPanel(lobbyId, cancelled = false) {
  local.lobbyPanels.get(lobbyId)?.remove();
  local.lobbyPanels.delete(lobbyId);
  if (cancelled) notify("info", "The card game invitation was cancelled.");
}

async function handleDeclines(event) {
  if (local.pendingDeclinePrompts.has(event.lobby.id)) return;
  local.pendingDeclinePrompts.add(event.lobby.id);
  const choice = await showPrompt({
    title: "Invitation Declined",
    content: `<p>The following user${event.declinedNames.length === 1 ? "" : "s"} declined:</p><p class="sbs-cg-declined-list"><strong>${event.declinedNames.map(esc).join(", ")}</strong></p><p>Start with everyone who accepted, or cancel the game?</p>`,
    buttons: [
      { label: "Cancel Game", value: "cancel" },
      { label: "Start Without Them", className: "primary", value: "start" }
    ]
  });
  local.pendingDeclinePrompts.delete(event.lobby.id);
  if (choice === "start") await sendAuthority("startAccepted", { lobbyId: event.lobby.id });
  else await sendAuthority("cancelLobby", { lobbyId: event.lobby.id });
}

function suitInfo(card) {
  return SUITS.find(suit => suit.id === card?.suit);
}

function cardHtml(card, { small = false, selectable = false, selected = false, index = null } = {}) {
  if (!card) return `<div class="sbs-card back ${small ? "small" : ""}"><img src="${gameIcon()}" alt="Card back"></div>`;
  const suit = suitInfo(card);
  return `<button type="button" class="sbs-card face ${suit?.red ? "red" : "black"} ${small ? "small" : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}" ${selectable ? `data-draw-card="${index}"` : "disabled"}>
    <span class="corner top">${esc(card.rank)}<i>${esc(suit?.symbol ?? card.suit)}</i></span>
    <b>${esc(suit?.symbol ?? card.suit)}</b>
    <span class="corner bottom">${esc(card.rank)}<i>${esc(suit?.symbol ?? card.suit)}</i></span>
  </button>`;
}

function cardsHtml(cards, options = {}) {
  return `<div class="sbs-card-row">${cards.map((card, index) => cardHtml(card, { ...options, index })).join("")}</div>`;
}

function hiddenCards(count, small = false) {
  return cardsHtml(Array.from({ length: count }, () => null), { small });
}

function seatPokerCards(seat) {
  if (seat.cards) return cardsHtml(seat.cards, { small: true });
  return hiddenCards(seat.cardCount, true);
}

function seatBlackjackCards(seat) {
  if (!seat.bjHands?.length) return "";
  return seat.bjHands.map((hand, index) => {
    const shown = hand.cards ? cardsHtml(hand.cards, { small: true }) : hiddenCards(hand.cardCount, true);
    const total = hand.cards ? blackjackTotal(hand.cards).total : "?";
    return `<div class="sbs-bj-public-hand"><small>Hand ${index + 1} · Bet ${hand.bet}${hand.cards ? ` · ${total}` : ""}</small>${shown}${hand.result ? `<em>${esc(hand.result)}</em>` : ""}</div>`;
  }).join("");
}

function seatHtml(view, seat, index) {
  const markers = [
    index === view.dealerIndex ? "D" : "",
    index === view.smallBlindIndex ? "SB" : "",
    index === view.bigBlindIndex ? "BB" : ""
  ].filter(Boolean).map(text => `<span>${text}</span>`).join("");
  const classes = [seat.current ? "current" : "", seat.folded ? "folded" : "", seat.own ? "own" : "", seat.allIn ? "all-in" : ""].join(" ");
  return `<article class="sbs-cg-seat ${classes}">
    <div class="sbs-seat-heading">${seat.avatar ? `<img src="${esc(seat.avatar)}" alt="">` : ""}<div><strong>${esc(seat.name)}</strong><small>${seat.chips} chips</small></div><aside>${markers}</aside></div>
    ${view.type === "blackjack" ? seatBlackjackCards(seat) : seatPokerCards(seat)}
    <div class="sbs-seat-status">${seat.folded ? "Folded" : esc(seat.lastAction || (seat.current ? "Thinking…" : ""))}${seat.betRound ? ` · Bet ${seat.betRound}` : ""}</div>
  </article>`;
}

function ownPokerControl(view, seat) {
  const action = view.actions[seat.id];
  const drawKey = `${view.id}:${seat.id}`;
  const selection = local.drawSelections.get(drawKey) ?? new Set();
  const hand = seat.cards ?? [];
  let controls = "";
  let handCards = cardsHtml(hand, action?.type === "draw" ? { selectable: true, selected: false } : {});
  if (action?.type === "draw") {
    handCards = `<div class="sbs-card-row">${hand.map((card, index) => cardHtml(card, { selectable: true, selected: selection.has(index), index })).join("")}</div>`;
    controls = `<button data-action="draw-submit" data-seat-id="${seat.id}" class="primary">Draw Selected</button><small>Select up to ${action.maxDraw}; select none to stand pat.</small>`;
  } else if (action?.type === "poker") {
    const buttons = [];
    if (action.canFold) buttons.push(`<button data-action="poker-fold" data-seat-id="${seat.id}">Fold</button>`);
    if (action.canCheck) buttons.push(`<button data-action="poker-check" data-seat-id="${seat.id}">Check</button>`);
    if (action.canCall) buttons.push(`<button data-action="poker-call" data-seat-id="${seat.id}">Call ${action.callAmount}</button>`);
    if (action.canBet || action.canRaise) {
      buttons.push(`<label class="sbs-cg-wager">${action.canBet ? "Bet" : "Raise to"}<input data-wager-for="${seat.id}" type="number" min="${action.minTarget}" max="${action.maximumTarget}" value="${action.minTarget}"></label>`);
      buttons.push(`<button data-action="poker-wager" data-seat-id="${seat.id}" class="primary">${action.canBet ? "Bet" : "Raise"}</button>`);
    }
    if (action.canAllIn) buttons.push(`<button data-action="poker-all-in" data-seat-id="${seat.id}" class="danger">All-In ${action.maximumTarget}</button>`);
    controls = buttons.join("");
  }
  return `<section class="sbs-own-hand ${action ? "has-action" : ""}"><header><strong>${esc(seat.name)}</strong><span>${seat.chips} chips</span></header>${handCards}<div class="sbs-action-bar">${controls || `<small>${seat.folded ? "Folded" : "Waiting for your turn."}</small>`}</div></section>`;
}

function ownBlackjackControl(view, seat) {
  const action = view.actions[seat.id];
  const hands = (seat.bjHands ?? []).map((hand, index) => {
    const total = hand.cards ? blackjackTotal(hand.cards).total : "?";
    return `<div class="sbs-own-bj-hand ${view.currentHandIndex === index && seat.current ? "active" : ""}"><strong>Hand ${index + 1} · Bet ${hand.bet || 0} · Total ${total}</strong>${hand.cards ? cardsHtml(hand.cards) : hiddenCards(hand.cardCount)}${hand.result ? `<em>${esc(hand.result)}</em>` : ""}</div>`;
  }).join("");
  let controls = "";
  if (action?.type === "blackjack-bet") {
    controls = `<label class="sbs-cg-wager">Bet <input data-bj-bet-for="${seat.id}" type="number" min="${action.min}" max="${action.max}" value="${action.min}"></label><button data-action="bj-bet" data-seat-id="${seat.id}" class="primary">Place Bet</button>`;
  } else if (action?.type === "blackjack-insurance") {
    controls = `<label class="sbs-cg-wager">Insurance <input data-bj-insurance-for="${seat.id}" type="number" min="0" max="${action.max}" value="0"></label><button data-action="bj-insurance" data-seat-id="${seat.id}" class="primary">Submit</button>`;
  } else if (action?.type === "blackjack-play") {
    if (action.canHit) controls += `<button data-action="bj-hit" data-seat-id="${seat.id}">Hit</button>`;
    if (action.canStand) controls += `<button data-action="bj-stand" data-seat-id="${seat.id}" class="primary">Stand</button>`;
    if (action.canDouble) controls += `<button data-action="bj-double" data-seat-id="${seat.id}">Double</button>`;
    if (action.canSplit) controls += `<button data-action="bj-split" data-seat-id="${seat.id}">Split</button>`;
    if (action.canSurrender) controls += `<button data-action="bj-surrender" data-seat-id="${seat.id}" class="danger">Surrender</button>`;
  }
  return `<section class="sbs-own-hand ${action ? "has-action" : ""}"><header><strong>${esc(seat.name)}</strong><span>${seat.chips} chips</span></header>${hands || `<p class="hint">No hand dealt yet.</p>`}<div class="sbs-action-bar">${controls || "<small>Waiting.</small>"}</div></section>`;
}

function mainTableHtml(view) {
  const community = view.type === "holdem"
    ? `<div class="sbs-community"><span>Community</span>${view.community.length ? cardsHtml(view.community) : hiddenCards(5)}</div>`
    : view.type === "blackjack"
      ? `<div class="sbs-community dealer"><span>Dealer</span>${view.dealerCards.length ? cardsHtml(view.dealerCards) : hiddenCards(2)}</div>`
      : `<div class="sbs-community draw-logo"><img src="${gameIcon()}" alt=""><strong>Five-Card Draw</strong></div>`;
  const seatGrid = view.seats.map((seat, index) => seatHtml(view, seat, index)).join("");
  const ownControls = view.seats.filter(seat => seat.own).map(seat => view.type === "blackjack" ? ownBlackjackControl(view, seat) : ownPokerControl(view, seat)).join("");
  const resultHtml = view.results.length ? `<div class="sbs-results">${view.results.map(result => `<p>${esc(result.text)}</p>`).join("")}</div>` : "";
  const hostControls = (game.user.id === view.hostUserId || game.user.isGM) ? `
    ${["complete", "game-over"].includes(view.phase) ? `<button data-action="next-hand" class="primary">${view.type === "blackjack" ? "Next Round" : "Next Hand"}</button>` : ""}
    <button data-action="add-chips">Add Chips</button>
    <button data-action="end-game" class="danger">End Table</button>` : "";
  return `
    <div class="sbs-cg-statusbar"><span>Hand ${view.handNumber}</span><strong>${esc(formatRound(view))}</strong><span>${view.type === "blackjack" ? "House Dealer" : `Pot ${view.pot}`}</span></div>
    <div class="sbs-cg-felt">
      ${community}
      <div class="sbs-cg-seat-grid">${seatGrid}</div>
      ${resultHtml}
    </div>
    <div class="sbs-own-area">${ownControls}</div>
    <details class="sbs-cg-log"><summary>Table Log</summary>${view.log.map(line => `<p>${esc(line)}</p>`).join("")}</details>
    <footer class="sbs-cg-table-footer">${hostControls}<button data-action="hide-window">Hide Window</button></footer>`;
}

function makeDraggable(windowElement) {
  const header = windowElement.querySelector(".sbs-cg-window-header");
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let left = 0;
  let top = 0;
  header.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    const rect = windowElement.getBoundingClientRect();
    left = rect.left;
    top = rect.top;
    windowElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  header.addEventListener("pointermove", event => {
    if (!dragging) return;
    windowElement.style.left = `${Math.max(0, left + event.clientX - startX)}px`;
    windowElement.style.top = `${Math.max(0, top + event.clientY - startY)}px`;
    windowElement.style.transform = "none";
  });
  header.addEventListener("pointerup", () => { dragging = false; });
}

function ensureGameWindow(view) {
  let windowElement = local.windows.get(view.id);
  if (!windowElement) {
    windowElement = document.createElement("section");
    windowElement.className = "sbs-cg-window";
    windowElement.dataset.tableId = view.id;
    windowElement.innerHTML = `<header class="sbs-cg-window-header"><img src="${gameIcon()}" alt=""><div><strong>${esc(view.name)}</strong><small>SaltyBananaSlug's Card Games</small></div><button type="button" data-action="hide-window">×</button></header><main></main>`;
    document.body.appendChild(windowElement);
    local.windows.set(view.id, windowElement);
    makeDraggable(windowElement);
    windowElement.addEventListener("click", event => handleGameWindowClick(event, view.id));
  }
  return windowElement;
}

function updateGameView(view) {
  local.views.set(view.id, view);
  const windowElement = ensureGameWindow(view);
  windowElement.hidden = false;
  windowElement.querySelector(".sbs-cg-window-header strong").textContent = view.name;
  windowElement.querySelector("main").innerHTML = mainTableHtml(view);
}

async function handleGameWindowClick(event, tableId) {
  const view = local.views.get(tableId);
  if (!view) return;
  const drawCardButton = event.target.closest("[data-draw-card]");
  if (drawCardButton) {
    const seatSection = drawCardButton.closest(".sbs-own-hand");
    const seatName = seatSection?.querySelector("header strong")?.textContent;
    const seat = view.seats.find(candidate => candidate.own && candidate.name === seatName && view.actions[candidate.id]?.type === "draw")
      ?? view.seats.find(candidate => view.actions[candidate.id]?.type === "draw");
    if (!seat) return;
    const key = `${tableId}:${seat.id}`;
    const selected = local.drawSelections.get(key) ?? new Set();
    const index = Number(drawCardButton.dataset.drawCard);
    if (selected.has(index)) selected.delete(index);
    else {
      const max = view.actions[seat.id].maxDraw;
      if (selected.size >= max) return notify("warn", `You may draw no more than ${max} cards.`);
      selected.add(index);
    }
    local.drawSelections.set(key, selected);
    drawCardButton.classList.toggle("selected", selected.has(index));
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const seatId = button.dataset.seatId;
  button.disabled = true;
  try {
    if (action === "hide-window") {
      local.windows.get(tableId).hidden = true;
      return;
    }
    if (action === "poker-fold") await sendAuthority("gameAction", { tableId, kind: "poker", seatId, action: "fold" });
    if (action === "poker-check") await sendAuthority("gameAction", { tableId, kind: "poker", seatId, action: "check" });
    if (action === "poker-call") await sendAuthority("gameAction", { tableId, kind: "poker", seatId, action: "call" });
    if (action === "poker-all-in") await sendAuthority("gameAction", { tableId, kind: "poker", seatId, action: "all-in" });
    if (action === "poker-wager") {
      const amount = local.windows.get(tableId).querySelector(`[data-wager-for="${CSS.escape(seatId)}"]`)?.value;
      const poker = view.actions[seatId];
      await sendAuthority("gameAction", { tableId, kind: "poker", seatId, action: poker.canBet ? "bet" : "raise", amount });
    }
    if (action === "draw-submit") {
      const key = `${tableId}:${seatId}`;
      const indexes = [...(local.drawSelections.get(key) ?? new Set())];
      local.drawSelections.delete(key);
      await sendAuthority("gameAction", { tableId, kind: "draw", seatId, indexes });
    }
    if (action === "bj-bet") {
      const amount = local.windows.get(tableId).querySelector(`[data-bj-bet-for="${CSS.escape(seatId)}"]`)?.value;
      await sendAuthority("gameAction", { tableId, kind: "blackjack-bet", seatId, amount });
    }
    if (action === "bj-insurance") {
      const amount = local.windows.get(tableId).querySelector(`[data-bj-insurance-for="${CSS.escape(seatId)}"]`)?.value;
      await sendAuthority("gameAction", { tableId, kind: "blackjack-insurance", seatId, amount });
    }
    if (action.startsWith("bj-") && !["bj-bet", "bj-insurance"].includes(action)) {
      await sendAuthority("gameAction", { tableId, kind: "blackjack-play", seatId, action: action.replace("bj-", "") });
    }
    if (action === "next-hand") await sendAuthority("gameAction", { tableId, kind: "next-hand" });
    if (action === "add-chips") await promptAddChips(view);
    if (action === "end-game") {
      const confirmed = await showPrompt({ title: "End Card Table?", content: "<p>This closes the game for everyone. The chips are imaginary, but the grudges are tragically real.</p>", buttons: [{ label: "Keep Playing", value: false }, { label: "End Table", className: "danger", value: true }] });
      if (confirmed) await sendAuthority("endGame", { tableId });
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} | Action failed`, error);
    notify("error", error.message || String(error));
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function promptAddChips(view) {
  const choice = await showPrompt({
    title: "Add Chips",
    content: `<label>Seat <select name="seatId">${view.seats.map(seat => `<option value="${esc(seat.id)}">${esc(seat.name)} — ${seat.chips}</option>`).join("")}</select></label><label>Amount <input name="amount" type="number" min="1" step="10" value="500"></label>`,
    buttons: [{ label: "Cancel", value: null }, { label: "Add", className: "primary", callback: form => ({ seatId: form.elements.seatId.value, amount: form.elements.amount.value }) }]
  });
  if (choice) await sendAuthority("gameAction", { tableId: view.id, kind: "add-chips", ...choice });
}

function closeGameWindow(tableId, ended = false) {
  local.windows.get(tableId)?.remove();
  local.windows.delete(tableId);
  local.views.delete(tableId);
  if (ended) notify("info", "The card table has closed.");
}

function socketLibModule() {
  return game.modules?.get?.("socketlib") ?? null;
}

function socketLibApi() {
  const module = socketLibModule();
  const candidates = [globalThis.socketlib, module?.api];
  return candidates.find(candidate => typeof candidate?.registerModule === "function") ?? null;
}

function socketFailureMessage() {
  const module = socketLibModule();
  if (!module) return "SocketLib is not installed. Install and enable SocketLib, then reload the world.";
  if (!module.active) return "SocketLib is installed but not enabled in this world. Enable it and reload the world.";
  return "SocketLib is enabled, but its API never became available. Reload the Foundry world; if the problem remains, update SocketLib and this module.";
}

function registerSocket() {
  if (socket) return socket;
  const module = socketLibModule();
  if (!module?.active) return null;
  const api = socketLibApi();
  if (!api) return null;

  try {
    socket = api.registerModule(MODULE_ID);
    socket.register("authorityRequest", authorityRequest);
    socket.register("receiveEvent", receiveEvent);
    console.log(`${LOG_PREFIX} | SocketLib registered.`);
    return socket;
  } catch (error) {
    socket = null;
    console.debug(`${LOG_PREFIX} | SocketLib registration is not ready yet.`, error);
    return null;
  }
}

async function ensureSocket({ notifyUser = false, attempts = 20, delay = 100 } = {}) {
  if (socket) return socket;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const registered = registerSocket();
    if (registered) return registered;
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, delay));
  }
  if (notifyUser) notify("error", socketFailureMessage());
  return null;
}

Hooks.once("socketlib.ready", registerSocket);

Hooks.once("ready", async () => {
  if (game.user.isGM) loadAuthority();
  const module = game.modules.get(MODULE_ID);
  module.api = {
    launch: launchGame,
    reopen: () => [...local.windows.values()].forEach(windowElement => { windowElement.hidden = false; }),
    socketStatus: () => ({
      registered: Boolean(socket),
      installed: Boolean(socketLibModule()),
      active: Boolean(socketLibModule()?.active),
      apiAvailable: Boolean(socketLibApi())
    }),
    version: "1.0.2"
  };

  await ensureSocket({ notifyUser: false, attempts: 30, delay: 100 });
  console.log(`${LOG_PREFIX} | Ready. Launch with the provided Foundry macro or /cards.`);

  setTimeout(async () => {
    if (!await ensureSocket({ notifyUser: false })) return;
    sendAuthority("resumeTables", {}).catch(error => console.debug(`${LOG_PREFIX} | No tables to resume`, error));
    if (game.user.isGM) {
      for (const state of authority.games.values()) sendViewsForGame(state.id).catch(console.error);
    }
  }, 500);
});

Hooks.on("chatMessage", (_chatLog, message) => {
  if (String(message).trim().toLowerCase() !== "/cards") return;
  launchGame();
  return false;
});
