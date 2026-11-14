// Foundry VTT v13 — run as GM.
// Disables Show in Navigation for every scene.
// Scenes remain in the Scenes directory.
// Monk's may continue showing the active and currently viewed scenes.

if (!game.user.isGM) {
  return ui.notifications.warn("Run this macro as the GM.");
}

const updates = game.scenes
  .filter(scene => scene.navigation)
  .map(scene => ({ _id: scene.id, navigation: false }));

if (!updates.length) {
  return ui.notifications.info("All scenes already have navigation disabled.");
}

try {
  await game.scenes.documentClass.updateDocuments(updates);
  ui.nav.render(true);
  ui.notifications.info(
    `Disabled navigation for ${updates.length} scenes.`
  );
} catch (error) {
  console.error("Clear scene navigation", error);
  ui.notifications.error("Could not update all scenes. Check the console.");
}
