const forge = game.modules.get("sbs-actor-forge");
if (!forge?.active || !forge.api) ui.notifications.error("Enable SaltyBananaSlug’s Actor Forge first.");
else await forge.api.open();
