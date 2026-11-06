if (!canvas.tokens.controlled.length) {
  return ui.notifications.warn("Select at least one token first.");
}
const updates = canvas.tokens.controlled.map(token => {
  const current = token.document.sight?.angle ?? 360;
  return {
    _id: token.document.id,
    "sight.enabled": true,
    "sight.angle": current === 180 ? 360 : 180
  };
});
await canvas.scene.updateEmbeddedDocuments("Token", updates);
ui.notifications.info("Toggled vision angle for selected token(s).");
