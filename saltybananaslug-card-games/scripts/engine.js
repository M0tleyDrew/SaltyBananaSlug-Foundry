export const SUITS = [
  { id: "s", symbol: "♠", name: "Spades", red: false },
  { id: "h", symbol: "♥", name: "Hearts", red: true },
  { id: "d", symbol: "♦", name: "Diamonds", red: true },
  { id: "c", symbol: "♣", name: "Clubs", red: false }
];

export const RANKS = [
  { id: "2", value: 2 }, { id: "3", value: 3 }, { id: "4", value: 4 },
  { id: "5", value: 5 }, { id: "6", value: 6 }, { id: "7", value: 7 },
  { id: "8", value: 8 }, { id: "9", value: 9 }, { id: "T", value: 10 },
  { id: "J", value: 11 }, { id: "Q", value: 12 }, { id: "K", value: 13 },
  { id: "A", value: 14 }
];

export const GAME_NAMES = {
  holdem: "Texas Hold'em",
  draw: "Five-Card Draw",
  blackjack: "Blackjack"
};

export function makeDeck() {
  return SUITS.flatMap(suit => RANKS.map(rank => ({
    suit: suit.id,
    rank: rank.id,
    value: rank.value,
    id: `${rank.id}${suit.id}`
  })));
}

export function shuffle(deck, random = Math.random) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function cardText(card) {
  if (!card) return "??";
  const suit = SUITS.find(s => s.id === card.suit)?.symbol ?? card.suit;
  return `${card.rank}${suit}`;
}

function combinations(items, size) {
  const out = [];
  const walk = (start, selected) => {
    if (selected.length === size) {
      out.push(selected.slice());
      return;
    }
    for (let i = start; i <= items.length - (size - selected.length); i++) {
      selected.push(items[i]);
      walk(i + 1, selected);
      selected.pop();
    }
  };
  walk(0, []);
  return out;
}

function straightHigh(uniqueDesc) {
  const values = [...uniqueDesc];
  if (values.includes(14)) values.push(1);
  for (let i = 0; i <= values.length - 5; i++) {
    if (values[i] - values[i + 4] === 4) return values[i];
  }
  return null;
}

export function evaluateFive(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) throw new Error("evaluateFive requires exactly five cards.");
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const flush = cards.every(c => c.suit === cards[0].suit);
  const unique = [...new Set(values)].sort((a, b) => b - a);
  const straight = straightHigh(unique);

  let category;
  let tiebreak;
  let label;
  if (flush && straight) {
    category = 8; tiebreak = [straight]; label = straight === 14 ? "Royal Flush" : "Straight Flush";
  } else if (groups[0][1] === 4) {
    category = 7; tiebreak = [groups[0][0], groups[1][0]]; label = "Four of a Kind";
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6; tiebreak = [groups[0][0], groups[1][0]]; label = "Full House";
  } else if (flush) {
    category = 5; tiebreak = values; label = "Flush";
  } else if (straight) {
    category = 4; tiebreak = [straight]; label = "Straight";
  } else if (groups[0][1] === 3) {
    category = 3;
    tiebreak = [groups[0][0], ...groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a)];
    label = "Three of a Kind";
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = groups.filter(g => g[1] === 2).map(g => g[0]).sort((a, b) => b - a);
    const kicker = groups.find(g => g[1] === 1)[0];
    category = 2; tiebreak = [...pairs, kicker]; label = "Two Pair";
  } else if (groups[0][1] === 2) {
    category = 1;
    tiebreak = [groups[0][0], ...groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a)];
    label = "One Pair";
  } else {
    category = 0; tiebreak = values; label = "High Card";
  }
  return { category, tiebreak, label, cards: cards.map(c => ({ ...c })) };
}

export function compareEvaluations(a, b) {
  if (a.category !== b.category) return Math.sign(a.category - b.category);
  const length = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < length; i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return Math.sign(av - bv);
  }
  return 0;
}

export function bestPokerHand(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) throw new Error("bestPokerHand requires five to seven cards.");
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const evaluated = evaluateFive(combo);
    if (!best || compareEvaluations(evaluated, best) > 0) best = evaluated;
  }
  return best;
}

export function blackjackTotal(cards) {
  const aceCount = cards.filter(card => card.rank === "A").length;
  let total = cards.reduce((sum, card) => sum + (card.rank === "A" ? 1 : Math.min(card.value, 10)), 0);
  let promotedAces = 0;
  if (aceCount > 0 && total + 10 <= 21) {
    total += 10;
    promotedAces = 1;
  }
  return { total, soft: promotedAces > 0 };
}

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function nextIndex(state, from, predicate = () => true) {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const index = (from + step + n) % n;
    if (predicate(state.seats[index], index)) return index;
  }
  return -1;
}

function activeForHand(seat) {
  return seat.chips > 0;
}

function canActPoker(seat) {
  return !seat.folded && !seat.allIn;
}

function pokerPot(state) {
  return state.seats.reduce((sum, seat) => sum + seat.committed, 0);
}

function drawCard(state) {
  if (!state.deck.length) throw new Error("The deck is empty.");
  return state.deck.pop();
}

function burn(state) {
  if (state.deck.length) state.burn.push(state.deck.pop());
}

function payIntoPot(seat, amount) {
  const paid = Math.max(0, Math.min(Math.floor(amount), seat.chips));
  seat.chips -= paid;
  seat.betRound += paid;
  seat.committed += paid;
  if (seat.chips === 0) seat.allIn = true;
  return paid;
}

function baseSeat(seat, chips) {
  return {
    id: seat.id,
    ownerUserId: seat.ownerUserId,
    name: seat.name,
    actorId: seat.actorId ?? null,
    avatar: seat.avatar ?? null,
    chips,
    hand: [],
    folded: false,
    allIn: false,
    betRound: 0,
    committed: 0,
    acted: false,
    reveal: false,
    drawDone: false,
    lastAction: "",
    bjHands: [],
    betLocked: false,
    insuranceDecision: false
  };
}

export function createGame(type, tableId, hostUserId, seats, settings = {}) {
  if (!GAME_NAMES[type]) throw new Error(`Unknown game type: ${type}`);
  const defaults = type === "blackjack"
    ? { startingChips: 500, minBet: 10, maxBet: 500, blackjackPayout: 1.5, dealerHitsSoft17: false, maxSplits: 3 }
    : type === "holdem"
      ? { startingChips: 1000, smallBlind: 10, bigBlind: 20 }
      : { startingChips: 1000, ante: 10, minBet: 20, maxDraw: 3 };
  const merged = { ...defaults, ...settings };
  const state = {
    id: tableId,
    type,
    name: GAME_NAMES[type],
    hostUserId,
    settings: merged,
    seats: seats.map(seat => baseSeat(seat, merged.startingChips)),
    deck: [],
    burn: [],
    community: [],
    dealerCards: [],
    dealerIndex: -1,
    smallBlindIndex: -1,
    bigBlindIndex: -1,
    currentSeatIndex: -1,
    currentHandIndex: 0,
    phase: "waiting",
    round: null,
    currentBet: 0,
    minRaise: type === "holdem" ? merged.bigBlind : merged.minBet,
    handNumber: 0,
    log: [],
    results: [],
    createdAt: Date.now()
  };
  if (type === "blackjack") startBlackjackRound(state);
  else startPokerHand(state);
  return state;
}

function resetPokerSeats(state) {
  for (const seat of state.seats) {
    seat.hand = [];
    seat.folded = seat.chips <= 0;
    seat.allIn = false;
    seat.betRound = 0;
    seat.committed = 0;
    seat.acted = false;
    seat.reveal = false;
    seat.drawDone = false;
    seat.lastAction = seat.chips <= 0 ? "Out" : "";
  }
}

function firstPostFlopActor(state) {
  return nextIndex(state, state.dealerIndex, seat => canActPoker(seat));
}

function firstDrawActor(state) {
  return nextIndex(state, state.dealerIndex, seat => !seat.folded);
}

function resetBettingRound(state) {
  state.currentBet = 0;
  state.minRaise = state.type === "holdem" ? state.settings.bigBlind : state.settings.minBet;
  for (const seat of state.seats) {
    seat.betRound = 0;
    seat.acted = false;
    if (!seat.folded) seat.lastAction = "";
  }
}

export function startPokerHand(state) {
  const active = state.seats.filter(activeForHand);
  if (active.length < 2) {
    state.phase = "game-over";
    state.results = [{ text: active.length === 1 ? `${active[0].name} wins the table.` : "No players have chips remaining." }];
    return state;
  }
  state.handNumber++;
  state.deck = shuffle(makeDeck());
  state.burn = [];
  state.community = [];
  state.results = [];
  resetPokerSeats(state);
  state.dealerIndex = nextIndex(state, state.dealerIndex, activeForHand);
  state.log = [`Hand ${state.handNumber} begins. ${state.seats[state.dealerIndex].name} has the dealer button.`];

  if (state.type === "holdem") {
    const activeCount = active.length;
    state.smallBlindIndex = activeCount === 2 ? state.dealerIndex : nextIndex(state, state.dealerIndex, activeForHand);
    state.bigBlindIndex = nextIndex(state, state.smallBlindIndex, activeForHand);
    for (let pass = 0; pass < 2; pass++) {
      let index = state.dealerIndex;
      for (let dealt = 0; dealt < activeCount; dealt++) {
        index = nextIndex(state, index, activeForHand);
        state.seats[index].hand.push(drawCard(state));
      }
    }
    const sbSeat = state.seats[state.smallBlindIndex];
    const bbSeat = state.seats[state.bigBlindIndex];
    const sb = payIntoPot(sbSeat, state.settings.smallBlind);
    const bb = payIntoPot(bbSeat, state.settings.bigBlind);
    sbSeat.lastAction = `Small blind ${sb}`;
    bbSeat.lastAction = `Big blind ${bb}`;
    state.currentBet = Math.max(sbSeat.betRound, bbSeat.betRound);
    state.minRaise = state.settings.bigBlind;
    state.round = "preflop";
    state.phase = "betting";
    state.currentSeatIndex = activeCount === 2
      ? state.smallBlindIndex
      : nextIndex(state, state.bigBlindIndex, canActPoker);
    state.log.push(`${sbSeat.name} posts ${sb}. ${bbSeat.name} posts ${bb}.`);
  } else {
    for (const seat of state.seats) {
      if (!activeForHand(seat)) continue;
      const ante = payIntoPot(seat, state.settings.ante);
      seat.betRound = 0; // Antes belong to the pot, not to the opening betting total.
      seat.lastAction = `Ante ${ante}`;
    }
    for (let pass = 0; pass < 5; pass++) {
      let index = state.dealerIndex;
      for (let dealt = 0; dealt < active.length; dealt++) {
        index = nextIndex(state, index, activeForHand);
        state.seats[index].hand.push(drawCard(state));
      }
    }
    state.round = "first-bet";
    state.phase = "betting";
    state.currentSeatIndex = nextIndex(state, state.dealerIndex, canActPoker);
    state.currentBet = 0;
    state.minRaise = state.settings.minBet;
    state.log.push(`Each player antes ${state.settings.ante}.`);
  }
  if (state.currentSeatIndex < 0) autoAdvancePoker(state, state.dealerIndex);
  return state;
}

export function legalPokerActions(state, seatId) {
  if (state.phase !== "betting") return null;
  const seatIndex = state.seats.findIndex(s => s.id === seatId);
  if (seatIndex !== state.currentSeatIndex) return null;
  const seat = state.seats[seatIndex];
  if (!canActPoker(seat)) return null;
  const toCall = Math.max(0, state.currentBet - seat.betRound);
  const maximumTarget = seat.betRound + seat.chips;
  const minTarget = state.currentBet === 0
    ? Math.min(maximumTarget, state.minRaise)
    : Math.min(maximumTarget, state.currentBet + state.minRaise);
  return {
    toCall,
    canCheck: toCall === 0,
    canCall: toCall > 0 && seat.chips > 0,
    callAmount: Math.min(toCall, seat.chips),
    canBet: state.currentBet === 0 && seat.chips > 0,
    canRaise: state.currentBet > 0 && maximumTarget > state.currentBet,
    minTarget,
    maximumTarget,
    canAllIn: seat.chips > 0,
    canFold: true
  };
}

function resetActedAfterRaise(state, raiserIndex) {
  state.seats.forEach((seat, index) => {
    if (index !== raiserIndex && canActPoker(seat)) seat.acted = false;
  });
}

export function pokerAction(state, seatId, action, amount = null) {
  const legal = legalPokerActions(state, seatId);
  if (!legal) throw new Error("It is not that seat's turn.");
  const index = state.currentSeatIndex;
  const seat = state.seats[index];
  const oldCurrentBet = state.currentBet;

  if (action === "fold") {
    seat.folded = true;
    seat.acted = true;
    seat.lastAction = "Fold";
    state.log.push(`${seat.name} folds.`);
  } else if (action === "check") {
    if (!legal.canCheck) throw new Error("That seat cannot check.");
    seat.acted = true;
    seat.lastAction = "Check";
    state.log.push(`${seat.name} checks.`);
  } else if (action === "call") {
    if (!legal.canCall) throw new Error("That seat cannot call.");
    const paid = payIntoPot(seat, legal.callAmount);
    seat.acted = true;
    seat.lastAction = paid < legal.toCall ? `All-in ${paid}` : `Call ${paid}`;
    state.log.push(`${seat.name} ${paid < legal.toCall ? "is all-in for" : "calls"} ${paid}.`);
  } else if (action === "bet" || action === "raise") {
    const target = Math.floor(Number(amount));
    if (!Number.isFinite(target)) throw new Error("Enter a valid bet total.");
    const isBet = state.currentBet === 0;
    if (isBet && !legal.canBet) throw new Error("That seat cannot bet.");
    if (!isBet && !legal.canRaise) throw new Error("That seat cannot raise.");
    if (target <= state.currentBet || target > legal.maximumTarget) throw new Error("That bet total is outside the legal range.");
    const raiseSize = target - state.currentBet;
    const isAllIn = target === legal.maximumTarget;
    if (raiseSize < state.minRaise && !isAllIn) throw new Error(`The minimum total is ${state.currentBet + state.minRaise}.`);
    const paid = payIntoPot(seat, target - seat.betRound);
    state.currentBet = seat.betRound;
    const fullRaise = isBet ? state.currentBet >= state.minRaise : raiseSize >= state.minRaise;
    if (fullRaise) {
      state.minRaise = isBet ? state.currentBet : raiseSize;
      resetActedAfterRaise(state, index);
    }
    seat.acted = true;
    seat.lastAction = `${isBet ? "Bet" : "Raise to"} ${state.currentBet}${seat.allIn ? " (all-in)" : ""}`;
    state.log.push(`${seat.name} ${isBet ? "bets" : "raises to"} ${state.currentBet}${seat.allIn ? " and is all-in" : ""}.`);
    void paid;
  } else if (action === "all-in") {
    if (!legal.canAllIn) throw new Error("That seat cannot go all-in.");
    const target = legal.maximumTarget;
    const paid = payIntoPot(seat, seat.chips);
    if (target > oldCurrentBet) {
      const raiseSize = target - oldCurrentBet;
      state.currentBet = target;
      if (raiseSize >= state.minRaise) {
        state.minRaise = raiseSize;
        resetActedAfterRaise(state, index);
      }
    }
    seat.acted = true;
    seat.lastAction = `All-in ${paid}`;
    state.log.push(`${seat.name} is all-in for ${paid}.`);
  } else {
    throw new Error(`Unknown poker action: ${action}`);
  }

  autoAdvancePoker(state, index);
  return state;
}

function nonFolded(state) {
  return state.seats.filter(seat => !seat.folded && seat.committed >= 0 && (seat.hand.length || activeForHand(seat)));
}

function bettingComplete(state) {
  const actors = state.seats.filter(canActPoker);
  if (!actors.length) return true;
  return actors.every(seat => seat.acted && seat.betRound === state.currentBet);
}

function nextPokerActor(state, from) {
  return nextIndex(state, from, seat => canActPoker(seat));
}

function awardUncontested(state) {
  const winner = state.seats.find(seat => !seat.folded);
  const pot = pokerPot(state);
  winner.chips += pot;
  state.results = [{ text: `${winner.name} wins ${pot} uncontested.`, seatIds: [winner.id], amount: pot }];
  state.log.push(`${winner.name} wins ${pot} uncontested.`);
  state.phase = "complete";
  state.currentSeatIndex = -1;
}

function buildSidePots(state) {
  const levels = [...new Set(state.seats.map(s => s.committed).filter(v => v > 0))].sort((a, b) => a - b);
  const pots = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = state.seats.filter(s => s.committed >= level);
    const amount = (level - previous) * contributors.length;
    const eligible = contributors.filter(s => !s.folded);
    if (amount > 0) pots.push({ amount, eligibleSeatIds: eligible.map(s => s.id) });
    previous = level;
  }
  return pots;
}

function seatEvaluation(state, seat) {
  return bestPokerHand(state.type === "holdem" ? [...seat.hand, ...state.community] : seat.hand);
}

function dealerOrder(state, seatIds) {
  const ordered = [];
  let index = state.dealerIndex;
  for (let i = 0; i < state.seats.length; i++) {
    index = nextIndex(state, index, () => true);
    if (seatIds.includes(state.seats[index].id)) ordered.push(state.seats[index].id);
  }
  return ordered;
}

function pokerShowdown(state) {
  state.phase = "showdown";
  state.currentSeatIndex = -1;
  const contenders = state.seats.filter(s => !s.folded);
  for (const seat of contenders) seat.reveal = true;
  const evaluations = new Map(contenders.map(seat => [seat.id, seatEvaluation(state, seat)]));
  const pots = buildSidePots(state);
  state.results = [];

  for (const [potIndex, pot] of pots.entries()) {
    let winners = [];
    let best = null;
    for (const seatId of pot.eligibleSeatIds) {
      const evaluated = evaluations.get(seatId);
      if (!best || compareEvaluations(evaluated, best) > 0) {
        best = evaluated;
        winners = [seatId];
      } else if (compareEvaluations(evaluated, best) === 0) {
        winners.push(seatId);
      }
    }
    if (!winners.length) continue;
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const seatId of winners) state.seats.find(s => s.id === seatId).chips += share;
    for (const seatId of dealerOrder(state, winners)) {
      if (remainder-- <= 0) break;
      state.seats.find(s => s.id === seatId).chips += 1;
    }
    const names = winners.map(id => state.seats.find(s => s.id === id).name).join(" & ");
    const potName = pots.length > 1 ? (potIndex === 0 ? "main pot" : `side pot ${potIndex}`) : "pot";
    const text = `${names} win${winners.length === 1 ? "s" : ""} the ${potName} of ${pot.amount} with ${best.label}.`;
    state.results.push({ text, seatIds: winners, amount: pot.amount, hand: best.label });
    state.log.push(text);
  }
  state.phase = "complete";
}

function beginNextBettingRound(state, round) {
  resetBettingRound(state);
  state.round = round;
  state.phase = "betting";
  state.currentSeatIndex = firstPostFlopActor(state);
  if (state.currentSeatIndex < 0) autoAdvancePoker(state, state.dealerIndex);
}

function advancePokerStreet(state) {
  if (state.type === "holdem") {
    if (state.round === "preflop") {
      burn(state);
      state.community.push(drawCard(state), drawCard(state), drawCard(state));
      state.log.push(`Flop: ${state.community.map(cardText).join(" ")}`);
      beginNextBettingRound(state, "flop");
    } else if (state.round === "flop") {
      burn(state);
      state.community.push(drawCard(state));
      state.log.push(`Turn: ${cardText(state.community.at(-1))}`);
      beginNextBettingRound(state, "turn");
    } else if (state.round === "turn") {
      burn(state);
      state.community.push(drawCard(state));
      state.log.push(`River: ${cardText(state.community.at(-1))}`);
      beginNextBettingRound(state, "river");
    } else {
      pokerShowdown(state);
    }
  } else if (state.round === "first-bet") {
    state.phase = "draw";
    state.round = "draw";
    for (const seat of state.seats) seat.drawDone = seat.folded;
    state.currentSeatIndex = firstDrawActor(state);
    if (state.currentSeatIndex < 0) beginNextBettingRound(state, "second-bet");
  } else {
    pokerShowdown(state);
  }
}

function autoAdvancePoker(state, fromIndex = state.currentSeatIndex) {
  let guard = 0;
  while (guard++ < 20) {
    const remaining = state.seats.filter(seat => !seat.folded);
    if (remaining.length === 1) {
      awardUncontested(state);
      return;
    }
    if (state.phase !== "betting") return;
    if (bettingComplete(state)) {
      advancePokerStreet(state);
      if (state.phase !== "betting") return;
      fromIndex = state.dealerIndex;
      continue;
    }
    const next = nextPokerActor(state, fromIndex);
    if (next < 0) {
      advancePokerStreet(state);
      return;
    }
    state.currentSeatIndex = next;
    return;
  }
  throw new Error("Poker state failed to advance safely.");
}

export function drawCards(state, seatId, indexes = []) {
  if (state.type !== "draw" || state.phase !== "draw") throw new Error("Cards cannot be drawn right now.");
  const seatIndex = state.seats.findIndex(s => s.id === seatId);
  if (seatIndex !== state.currentSeatIndex) throw new Error("It is not that seat's draw.");
  const seat = state.seats[seatIndex];
  const unique = [...new Set(indexes.map(Number))].sort((a, b) => b - a);
  if (unique.some(i => !Number.isInteger(i) || i < 0 || i >= seat.hand.length)) throw new Error("Invalid discard selection.");
  if (unique.length > state.settings.maxDraw) throw new Error(`A player may draw no more than ${state.settings.maxDraw} cards.`);
  const discarded = [];
  for (const index of unique) discarded.push(...seat.hand.splice(index, 1));
  while (seat.hand.length < 5) {
    if (!state.deck.length) {
      // Standard draw-poker fallback: reshuffle prior discards, but never deal a card
      // back to the same player during the draw in which they discarded it.
      state.deck = shuffle(state.burn.splice(0));
      if (!state.deck.length) throw new Error("There are not enough cards remaining to complete the draw.");
    }
    seat.hand.push(drawCard(state));
  }
  state.burn.push(...discarded);
  seat.drawDone = true;
  seat.lastAction = unique.length ? `Drew ${unique.length}` : "Stood pat";
  state.log.push(`${seat.name} ${unique.length ? `draws ${unique.length}` : "stands pat"}.`);
  const next = nextIndex(state, seatIndex, s => !s.folded && !s.drawDone);
  if (next >= 0) {
    state.currentSeatIndex = next;
  } else {
    beginNextBettingRound(state, "second-bet");
  }
  return state;
}

function resetBlackjackSeats(state) {
  for (const seat of state.seats) {
    seat.hand = [];
    seat.bjHands = [];
    seat.betLocked = false;
    seat.insuranceDecision = false;
    seat.lastAction = seat.chips > 0 ? "Choose a bet" : "Out of chips";
  }
}

export function startBlackjackRound(state) {
  if (state.type !== "blackjack") throw new Error("Not a blackjack table.");
  const active = state.seats.filter(s => s.chips >= state.settings.minBet);
  if (!active.length) {
    state.phase = "game-over";
    state.results = [{ text: "No player has enough chips for the minimum bet." }];
    return state;
  }
  state.handNumber++;
  state.deck = shuffle(makeDeck());
  state.dealerCards = [];
  state.results = [];
  state.log = [`Blackjack round ${state.handNumber} begins.`];
  state.phase = "betting";
  state.round = "betting";
  state.currentSeatIndex = -1;
  state.currentHandIndex = 0;
  resetBlackjackSeats(state);
  return state;
}

export function blackjackBet(state, seatId, amount) {
  if (state.type !== "blackjack" || state.phase !== "betting") throw new Error("Bets are not being accepted right now.");
  const seat = state.seats.find(s => s.id === seatId);
  if (!seat || seat.betLocked) throw new Error("That seat cannot place a bet.");
  const bet = Math.floor(Number(amount));
  const max = Math.min(state.settings.maxBet, seat.chips);
  if (!Number.isFinite(bet) || bet < state.settings.minBet || bet > max) throw new Error(`Bet between ${state.settings.minBet} and ${max}.`);
  seat.chips -= bet;
  seat.bjHands = [{ cards: [], bet, insurance: 0, status: "waiting", doubled: false, surrendered: false, fromSplit: false, splitAces: false, result: "" }];
  seat.betLocked = true;
  seat.lastAction = `Bet ${bet}`;
  state.log.push(`${seat.name} bets ${bet}.`);
  const eligible = state.seats.filter(s => s.chips + (s.bjHands[0]?.bet ?? 0) >= state.settings.minBet);
  if (eligible.every(s => s.betLocked)) dealBlackjack(state);
  return state;
}

function dealerUpcard(state) {
  return state.dealerCards[0];
}

function isTenValue(card) {
  return card && Math.min(card.value, 10) === 10;
}

function naturalBlackjack(hand) {
  return hand.cards.length === 2 && !hand.fromSplit && blackjackTotal(hand.cards).total === 21;
}

function dealBlackjack(state) {
  const playing = state.seats.filter(s => s.betLocked);
  for (const seat of playing) seat.bjHands[0].cards.push(drawCard(state));
  state.dealerCards.push(drawCard(state));
  for (const seat of playing) seat.bjHands[0].cards.push(drawCard(state));
  state.dealerCards.push(drawCard(state));
  for (const seat of playing) {
    const hand = seat.bjHands[0];
    hand.status = naturalBlackjack(hand) ? "blackjack" : "playing";
  }
  state.log.push(`Dealer shows ${cardText(dealerUpcard(state))}.`);
  if (dealerUpcard(state).rank === "A") {
    state.phase = "insurance";
    state.round = "insurance";
    for (const seat of playing) seat.insuranceDecision = false;
  } else if (isTenValue(dealerUpcard(state)) && blackjackTotal(state.dealerCards).total === 21) {
    settleDealerBlackjack(state);
  } else {
    beginBlackjackTurns(state);
  }
}

export function blackjackInsurance(state, seatId, amount = 0) {
  if (state.phase !== "insurance") throw new Error("Insurance is not being offered.");
  const seat = state.seats.find(s => s.id === seatId);
  if (!seat?.betLocked || seat.insuranceDecision) throw new Error("That seat cannot choose insurance.");
  const max = Math.min(Math.floor(seat.bjHands[0].bet / 2), seat.chips);
  const insurance = Math.floor(Number(amount));
  if (!Number.isFinite(insurance) || insurance < 0 || insurance > max) throw new Error(`Insurance must be between 0 and ${max}.`);
  seat.chips -= insurance;
  seat.bjHands[0].insurance = insurance;
  seat.insuranceDecision = true;
  seat.lastAction = insurance ? `Insurance ${insurance}` : "No insurance";
  state.log.push(`${seat.name} ${insurance ? `takes ${insurance} insurance` : "declines insurance"}.`);
  if (state.seats.filter(s => s.betLocked).every(s => s.insuranceDecision)) {
    if (blackjackTotal(state.dealerCards).total === 21) settleDealerBlackjack(state);
    else beginBlackjackTurns(state);
  }
  return state;
}

function settleDealerBlackjack(state) {
  state.phase = "complete";
  state.round = "settlement";
  state.results = [];
  for (const seat of state.seats.filter(s => s.betLocked)) {
    for (const hand of seat.bjHands) {
      if (hand.insurance > 0) seat.chips += hand.insurance * 3;
      if (naturalBlackjack(hand)) {
        seat.chips += hand.bet;
        hand.result = "Push — both have blackjack";
      } else {
        hand.result = "Dealer blackjack — loss";
      }
    }
    const insuranceText = seat.bjHands[0].insurance ? ` Insurance pays ${seat.bjHands[0].insurance * 2} profit.` : "";
    state.results.push({ text: `${seat.name}: ${seat.bjHands[0].result}.${insuranceText}` });
  }
  state.log.push("Dealer has blackjack.");
}

function findNextBlackjackHand(state, fromSeat = -1, fromHand = -1) {
  for (let si = Math.max(0, fromSeat); si < state.seats.length; si++) {
    const startHand = si === fromSeat ? fromHand + 1 : 0;
    for (let hi = startHand; hi < state.seats[si].bjHands.length; hi++) {
      if (state.seats[si].bjHands[hi].status === "playing") return { seatIndex: si, handIndex: hi };
    }
  }
  return null;
}

function beginBlackjackTurns(state) {
  state.phase = "playing";
  state.round = "players";
  const next = findNextBlackjackHand(state, 0, -1);
  if (!next) return playDealer(state);
  state.currentSeatIndex = next.seatIndex;
  state.currentHandIndex = next.handIndex;
  state.seats[next.seatIndex].lastAction = `Playing hand ${next.handIndex + 1}`;
}

function advanceBlackjackTurn(state) {
  const next = findNextBlackjackHand(state, state.currentSeatIndex, state.currentHandIndex);
  if (next) {
    state.currentSeatIndex = next.seatIndex;
    state.currentHandIndex = next.handIndex;
    state.seats[next.seatIndex].lastAction = `Playing hand ${next.handIndex + 1}`;
  } else {
    playDealer(state);
  }
}

export function legalBlackjackActions(state, seatId) {
  if (state.phase !== "playing") return null;
  const seatIndex = state.seats.findIndex(s => s.id === seatId);
  if (seatIndex !== state.currentSeatIndex) return null;
  const seat = state.seats[seatIndex];
  const hand = seat.bjHands[state.currentHandIndex];
  if (!hand || hand.status !== "playing") return null;
  const sameRank = hand.cards.length === 2 && hand.cards[0].rank === hand.cards[1].rank;
  return {
    handIndex: state.currentHandIndex,
    canHit: true,
    canStand: true,
    canDouble: hand.cards.length === 2 && seat.chips >= hand.bet,
    canSplit: sameRank && seat.chips >= hand.bet && seat.bjHands.length <= state.settings.maxSplits,
    canSurrender: hand.cards.length === 2 && !hand.fromSplit
  };
}

export function blackjackAction(state, seatId, action) {
  const legal = legalBlackjackActions(state, seatId);
  if (!legal) throw new Error("It is not that seat's turn.");
  const seat = state.seats[state.currentSeatIndex];
  let hand = seat.bjHands[state.currentHandIndex];

  if (action === "hit") {
    hand.cards.push(drawCard(state));
    const total = blackjackTotal(hand.cards).total;
    seat.lastAction = `Hit — ${total}`;
    state.log.push(`${seat.name} hits.`);
    if (total > 21) {
      hand.status = "bust";
      hand.result = `Bust with ${total}`;
      advanceBlackjackTurn(state);
    } else if (total === 21) {
      hand.status = "stand";
      advanceBlackjackTurn(state);
    }
  } else if (action === "stand") {
    hand.status = "stand";
    seat.lastAction = `Stand on ${blackjackTotal(hand.cards).total}`;
    state.log.push(`${seat.name} stands.`);
    advanceBlackjackTurn(state);
  } else if (action === "double") {
    if (!legal.canDouble) throw new Error("That hand cannot double down.");
    seat.chips -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(drawCard(state));
    const total = blackjackTotal(hand.cards).total;
    hand.status = total > 21 ? "bust" : "stand";
    hand.result = total > 21 ? `Bust with ${total}` : "";
    seat.lastAction = `Doubled — ${total}`;
    state.log.push(`${seat.name} doubles down.`);
    advanceBlackjackTurn(state);
  } else if (action === "split") {
    if (!legal.canSplit) throw new Error("That hand cannot be split.");
    seat.chips -= hand.bet;
    const [first, second] = hand.cards;
    const splitAces = first.rank === "A";
    const handA = { ...clone(hand), cards: [first, drawCard(state)], insurance: 0, status: splitAces ? "stand" : "playing", fromSplit: true, splitAces, result: "" };
    const handB = { ...clone(hand), cards: [second, drawCard(state)], insurance: 0, status: splitAces ? "stand" : "playing", fromSplit: true, splitAces, result: "" };
    seat.bjHands.splice(state.currentHandIndex, 1, handA, handB);
    seat.lastAction = splitAces ? "Split aces" : "Split";
    state.log.push(`${seat.name} splits${splitAces ? " aces" : ""}.`);
    if (splitAces) advanceBlackjackTurn(state);
    else hand = seat.bjHands[state.currentHandIndex];
  } else if (action === "surrender") {
    if (!legal.canSurrender) throw new Error("That hand cannot surrender.");
    hand.status = "surrender";
    hand.surrendered = true;
    hand.result = "Surrendered";
    seat.chips += Math.floor(hand.bet / 2);
    seat.lastAction = "Surrender";
    state.log.push(`${seat.name} surrenders.`);
    advanceBlackjackTurn(state);
  } else {
    throw new Error(`Unknown blackjack action: ${action}`);
  }
  return state;
}

function playDealer(state) {
  state.phase = "dealer";
  state.round = "dealer";
  while (true) {
    const score = blackjackTotal(state.dealerCards);
    const shouldHit = score.total < 17 || (score.total === 17 && score.soft && state.settings.dealerHitsSoft17);
    if (!shouldHit) break;
    state.dealerCards.push(drawCard(state));
  }
  settleBlackjack(state);
}

function settleBlackjack(state) {
  const dealer = blackjackTotal(state.dealerCards);
  state.results = [];
  for (const seat of state.seats.filter(s => s.betLocked)) {
    for (const hand of seat.bjHands) {
      if (hand.status === "surrender") continue;
      const total = blackjackTotal(hand.cards).total;
      if (total > 21) {
        hand.result = `Bust — loses ${hand.bet}`;
      } else if (naturalBlackjack(hand)) {
        const payout = hand.bet + Math.floor(hand.bet * state.settings.blackjackPayout);
        seat.chips += payout;
        hand.result = `Blackjack — wins ${payout - hand.bet}`;
      } else if (dealer.total > 21) {
        seat.chips += hand.bet * 2;
        hand.result = `Dealer busts — wins ${hand.bet}`;
      } else if (total > dealer.total) {
        seat.chips += hand.bet * 2;
        hand.result = `Wins ${hand.bet}`;
      } else if (total === dealer.total) {
        seat.chips += hand.bet;
        hand.result = "Push";
      } else {
        hand.result = `Loses ${hand.bet}`;
      }
    }
    const text = `${seat.name}: ${seat.bjHands.map((h, i) => `Hand ${i + 1} ${h.result}`).join("; ")}.`;
    state.results.push({ text });
    state.log.push(text);
  }
  state.phase = "complete";
  state.round = "settlement";
  state.currentSeatIndex = -1;
}

export function nextHand(state) {
  if (state.phase !== "complete" && state.phase !== "game-over") throw new Error("The current hand is not finished.");
  if (state.type === "blackjack") return startBlackjackRound(state);
  return startPokerHand(state);
}

export function addChips(state, seatId, amount) {
  const seat = state.seats.find(s => s.id === seatId);
  if (!seat) throw new Error("Seat not found.");
  const chips = Math.max(0, Math.floor(Number(amount)));
  if (!Number.isFinite(chips) || chips <= 0) throw new Error("Enter a positive chip amount.");
  seat.chips += chips;
  state.log.push(`${seat.name} receives ${chips} additional chips.`);
  return state;
}

export function sanitizeState(state, userId) {
  const ownSeatIds = state.seats.filter(s => s.ownerUserId === userId).map(s => s.id);
  const publicSeats = state.seats.map((seat, index) => {
    const own = ownSeatIds.includes(seat.id);
    const showPoker = own || seat.reveal;
    const showBlackjack = own;
    return {
      id: seat.id,
      ownerUserId: seat.ownerUserId,
      name: seat.name,
      actorId: seat.actorId,
      avatar: seat.avatar,
      chips: seat.chips,
      folded: seat.folded,
      allIn: seat.allIn,
      betRound: seat.betRound,
      committed: seat.committed,
      lastAction: seat.lastAction,
      current: index === state.currentSeatIndex,
      cardCount: seat.hand.length,
      cards: state.type === "blackjack" ? null : (showPoker ? clone(seat.hand) : null),
      bjHands: state.type !== "blackjack" ? null : seat.bjHands.map(hand => ({
        cards: showBlackjack ? clone(hand.cards) : null,
        cardCount: hand.cards.length,
        bet: hand.bet,
        insurance: own ? hand.insurance : 0,
        status: hand.status,
        doubled: hand.doubled,
        surrendered: hand.surrendered,
        result: state.phase === "complete" || own ? hand.result : ""
      })),
      betLocked: seat.betLocked,
      insuranceDecision: own ? seat.insuranceDecision : undefined,
      drawDone: seat.drawDone,
      own
    };
  });

  let dealerCards = [];
  if (state.type === "blackjack") {
    const revealDealer = ["dealer", "complete", "game-over"].includes(state.phase);
    dealerCards = state.dealerCards.map((card, index) => index === 0 || revealDealer ? clone(card) : null);
  }

  const actions = {};
  for (const seatId of ownSeatIds) {
    const seat = state.seats.find(s => s.id === seatId);
    if (state.type === "blackjack") {
      if (state.phase === "betting" && !seat.betLocked && seat.chips >= state.settings.minBet) {
        actions[seatId] = { type: "blackjack-bet", min: state.settings.minBet, max: Math.min(state.settings.maxBet, seat.chips) };
      } else if (state.phase === "insurance" && seat.betLocked && !seat.insuranceDecision) {
        actions[seatId] = { type: "blackjack-insurance", max: Math.min(Math.floor(seat.bjHands[0].bet / 2), seat.chips) };
      } else {
        const legal = legalBlackjackActions(state, seatId);
        if (legal) actions[seatId] = { type: "blackjack-play", ...legal };
      }
    } else if (state.phase === "draw" && state.seats[state.currentSeatIndex]?.id === seatId) {
      actions[seatId] = { type: "draw", maxDraw: state.settings.maxDraw };
    } else {
      const legal = legalPokerActions(state, seatId);
      if (legal) actions[seatId] = { type: "poker", ...legal };
    }
  }

  return {
    id: state.id,
    type: state.type,
    name: state.name,
    hostUserId: state.hostUserId,
    settings: clone(state.settings),
    seats: publicSeats,
    community: clone(state.community),
    dealerCards,
    dealerIndex: state.dealerIndex,
    smallBlindIndex: state.smallBlindIndex,
    bigBlindIndex: state.bigBlindIndex,
    currentSeatIndex: state.currentSeatIndex,
    currentHandIndex: state.currentHandIndex,
    phase: state.phase,
    round: state.round,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pot: pokerPot(state),
    handNumber: state.handNumber,
    log: state.log.slice(-24),
    results: clone(state.results),
    actions,
    ownSeatIds
  };
}
