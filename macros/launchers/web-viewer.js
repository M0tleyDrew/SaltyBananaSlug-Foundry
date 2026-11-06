// SaltyBananaSlug's Web Viewer — Launcher Macro
const MODULE_ID = "saltybananaslug-web-viewer";
const mod = game.modules.get(MODULE_ID);

if (!mod) {
  ui.notifications.error("SaltyBananaSlug's Web Viewer is not installed correctly. Check that module.json is directly inside Data/modules/saltybananaslug-web-viewer/.");
} else if (!mod.active) {
  ui.notifications.error("SaltyBananaSlug's Web Viewer is installed but not enabled for this world.");
} else if (!mod.api?.open) {
  ui.notifications.error("The Web Viewer API is not ready. Reload the Foundry world.");
} else {
  mod.api.open();
}
