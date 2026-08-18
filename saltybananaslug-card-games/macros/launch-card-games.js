// SaltyBananaSlug's Card Games — Foundry Script Macro
const cardGames = game.modules.get("saltybananaslug-card-games");

if (!cardGames?.active) {
  return ui.notifications.error("SaltyBananaSlug's Card Games is not enabled in this world.");
}

if (typeof cardGames.api?.launch !== "function") {
  return ui.notifications.error("The Card Games module is still loading. Reload the world and try again.");
}

await cardGames.api.launch();
