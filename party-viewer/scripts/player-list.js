const MODULE_ID = "party-viewer";
const STYLE_ID = "party-viewer-hide-player-list";
let registered = false;

export function applyPlayerListVisibility(hidden = game.settings.get(MODULE_ID, "hidePlayerList")) {
  let style = document.getElementById(STYLE_ID);
  if (hidden) {
    // Keep later connection/status renders hidden as well as the initial window.
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = "#players { display: none !important; }";
      document.head.appendChild(style);
    }
    if (ui.players?.rendered) return ui.players.close();
  } else {
    style?.remove();
    return ui.players?.render(true);
  }
}

export function registerPlayerListSetting() {
  game.settings.register(MODULE_ID, "hidePlayerList", {
    name: "Hide Foundry Online Player List",
    hint: "Automatically hides the standard online-player list for every player and GM each session. Turn this off to show it again.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: value => applyPlayerListVisibility(value)
  });
  registered = true;
}

Hooks.on("renderPlayers", () => {
  if (!registered || !game.settings.get(MODULE_ID, "hidePlayerList")) return;
  // Leave Foundry's current render before closing the application.
  queueMicrotask(() => {
    if (game.settings.get(MODULE_ID, "hidePlayerList")) applyPlayerListVisibility(true);
  });
});
