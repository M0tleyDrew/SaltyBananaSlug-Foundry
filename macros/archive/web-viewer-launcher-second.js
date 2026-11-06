// SaltyBananaSlug's Web Viewer — Launcher Macro
const MODULE_ID = "saltybananaslug-web-viewer";
const module = game.modules.get(MODULE_ID);

if (!module) {
  ui.notifications.error("SaltyBananaSlug's Web Viewer is not installed correctly. Check that module.json is directly inside Data/modules/saltybananaslug-web-viewer/.");
} else if (!module.active) {
  ui.notifications.error("SaltyBananaSlug's Web Viewer is installed but not enabled for this world.");
} else if (!module.api?.open) {
  ui.notifications.error("The Web Viewer API is not ready. Reload the Foundry world.");
} else {
  module.api.open();
}
