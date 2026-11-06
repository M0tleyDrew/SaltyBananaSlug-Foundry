if (!canvas.tokens.controlled.length) {
  return ui.notifications.warn("Select at least one token first.");
}
const updates = canvas.tokens.controlled.map(token => ({
  _id: token.document.id,
  "sight.enabled": true,
  "sight.angle": 180
}));
await canvas.scene.updateEmbeddedDocuments("Token", updates);
ui.notifications.info(`Set ${updates.length} token(s) to 180° vision.`);
