const api = game.modules.get("saltybananaslug-actor-journal")?.api;
if (!api) {
  ui.notifications.error("SaltyBananaSlug's Actor Journal is not enabled.");
} else {
  api.open();
}
