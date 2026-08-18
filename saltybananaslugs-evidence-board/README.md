# SaltyBananaSlug's Evidence Board

A shared, player-facing investigation board for Foundry VTT v13.

## Version 0.1.0

### Included
- Multiple evidence boards per world.
- Boards are stored as Journal Entries, so Foundry ownership controls who can view or edit them.
- GM board manager for creating, opening, duplicating, renaming, permissions, locking, and deleting boards.
- Drag-and-drop support for Actors, Items, Journal Entries/Pages, Scenes, Roll Tables, Playlists, Cards, and other UUID-backed Foundry documents.
- Sticky-note cards.
- Image cards from a file path or URL.
- Draggable evidence cards on a large corkboard canvas.
- Labeled connections between cards.
- Click a connection to edit or delete it.
- Search/filter cards by title, body, and type.
- Zoom controls.
- Board locking: players can still view a locked board but only GMs can alter it.
- Per-player None / View / Edit permissions plus a default permission.
- SBS branding and shared logo.
- Scene Controls button.
- Automatically-created macro: **Open Evidence Boards**.
- Live refresh when another user changes the same board.

### Foundry API
```js
game.modules.get("saltybananaslugs-evidence-board").api.openManager();
game.modules.get("saltybananaslugs-evidence-board").api.openBoard(boardIdOrJournal);
```

### Storage
Each board is a Journal Entry marked with module flags. Do not manually edit those flags unless you enjoy summoning bugs recreationally.

### Notes
- A player needs **Owner/Edit** permission on a board to move cards, edit notes, make connections, or drop new evidence.
- A board can be locked by the GM to temporarily make it read-only for players.
- Document cards do not bypass Foundry permissions. If a player cannot open the linked Actor/Journal/etc., the board does not magically grant access.
