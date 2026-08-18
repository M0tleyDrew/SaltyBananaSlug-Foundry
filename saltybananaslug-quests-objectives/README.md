# SaltyBananaSlug's Quests & Objectives

Foundry VTT v13 module for campaign quests, nested objectives, personal player quests, hidden/revealed objectives, completion history, tracked quests, and campaign reset tools.

## Installation

1. Extract the `saltybananaslug-quests-objectives` folder into Foundry's `Data/modules/` directory.
2. Restart Foundry VTT.
3. Enable **SaltyBananaSlug's Quests & Objectives** in the world.

## Launching

By default the module adds its own **Quests & Objectives** control group to the left-side Scene Controls.

It also creates four SBS-branded world macros for the GM:
- Open Quest Board
- Create Personal Quest
- Open Tracked Quest
- Quest Manager

A client-side floating quest launcher can be enabled in Module Settings.

## Permissions

- GMs can create, edit, complete, reset, reveal, hide, or delete any quest.
- Players can create personal quests.
- Personal quests can be private (player + GM) or party-visible.
- Players can edit, complete, reset, or delete only their own personal quests.
- GM-created quest objectives are read-only for players.

## Data model

Objectives are always nested inside their parent quest. They are not standalone records.

Quest visibility and objective visibility are separate, allowing a GM to reveal a quest while keeping later objectives hidden until they become relevant.

## v0.1.2
- Quest Board launcher now reuses, restores, and focuses the existing ApplicationV2 window instead of force-rendering it on every click.
- Added launch serialization and a fresh-window retry to prevent rapid-click/closing-state failures.
- Replaced the generic main Scene Control icon with SBS banana-slug branding.
- Gave the Open Quest Board subtool its own SBS quest-board artwork.


## v0.1.4
- Fixed the Scene Control launcher by no longer using the momentary Quest Board button as the control group's persistent `activeTool`.
- Added a hidden inert Scene Control anchor so the Open Quest Board button remains repeatable after the first launch.
- Switching to the SBS Quests & Objectives control group still opens the Quest Board.
- Quest Board launching now follows Foundry v13's own `foundry.applications.instances` pattern and creates a fresh window whenever no rendered board exists.
- Added clearly labeled **Delete Quest** buttons to quest cards and to the existing-quest editor, with the existing confirmation prompt.

## v0.1.3
- Fixed Open Quest Board by removing reliance on an undocumented global ApplicationV2 registry.
- Added the required `socket: true` module manifest declaration so quest updates relay between connected clients.
- Added a world quest-data `onChange` refresh as a core-backed synchronization fallback.


## v0.1.5
- Fixed the GM Quest Manager for large quest lists. The manager header and controls stay visible while the quest list scrolls independently.
- Quest cards no longer shrink or clip when many quests are present.
- This patch is scoped to the GM manager; the player Quest Board layout is unchanged.


## v0.1.6
- Fixed `Always Visible` objectives being converted back to sequential/hidden behavior when saving a sequential quest.
- Sequential quests now choose a reveal-rule default only when a new objective is added; explicit GM reveal-rule choices always win afterward.
- `Always Visible` objectives now persist both current and reset visibility as visible.
