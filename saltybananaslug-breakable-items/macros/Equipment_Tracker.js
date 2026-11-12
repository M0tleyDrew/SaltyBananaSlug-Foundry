const module = game.modules.get("saltybananaslug-breakable-items");
if (!module?.active || !module.api) {
  ui.notifications.warn("Enable SaltyBananaSlug's Breakable Items first.");
} else {
  module.api.open();
}
