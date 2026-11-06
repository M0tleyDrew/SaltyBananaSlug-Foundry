// SaltyBananaSlug's Web Viewer — Launcher Macro
const module = game.modules.get("saltybananaslug-web-viewer");

if (!module?.active) {
  ui.notifications.error("SaltyBananaSlug's Web Viewer is not enabled.");
} else if (!module.api?.open) {
  ui.notifications.error("The Web Viewer API is not ready. Reload the Foundry world.");
} else {
  module.api.open();
}
