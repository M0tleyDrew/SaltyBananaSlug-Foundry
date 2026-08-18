# SaltyBananaSlug's Lore Module

A Foundry Virtual Tabletop v13 module for campaign lore, chapter-based multiple-choice quizzes, and per-player statistics.

## Features

- Any number of lore sets, suitable for chapters, regions, factions, or separate campaigns.
- Published or GM-only sets.
- Lore entries stored as text, loaded from local `.txt`, `.md`, or `.html` files, linked to Journal Entry/Page UUIDs, linked to web URLs, or linked to files in Foundry's Data directory.
- Questions added manually with any number of answer options.
- Bulk text importer with unlimited option labels (`A` through `Z`, then `AA`, `AB`, and so on).
- Correct answer marked with `B*:` or a separate `ANSWER: B` line.
- Players are told whether they were correct. Incorrect answers reveal the correct answer, and optional explanations appear after answering.
- GM-authoritative scoring over Foundry's built-in module socket. SocketLib is not required.
- GM statistics show total correct/incorrect attempts, accuracy by player and set, every wrong question, the selected answer, and the correct answer.
- Reset one player's history, all scores, or the entire module.
- Re-uploadable JSON backups containing all sets, lore, questions, and scores.
- Re-uploadable text export for individual sets.
- Floating launcher with eight selectable screen positions and a client-side hide setting.
- Launcher macros included.

## Installation

1. Copy the `saltybananaslugs-lore-module` folder into Foundry's `Data/modules` folder.
2. Restart Foundry or return to Setup.
3. Enable **SaltyBananaSlug's Lore Module** in the world's Manage Modules screen.
4. A GM can right-click the floating Lore button, Shift-click it, or run the GM macro to open the manager.

## Launcher Macros

Player/GM launcher:

```js
game.saltyBananaSlugLore.launch();
```

GM manager:

```js
game.saltyBananaSlugLore.openManager();
```

## Bulk Import Format

```text
SET: Chapter One
DESCRIPTION: Optional set description

LORE_TEXT: Stored Lore Title
Any number of text lines.
END_LORE

LORE: Journal Link | journal | JournalEntry.UUID
LORE: Web Link | url | https://example.com
LORE: File Handout | file | worlds/my-world/lore/handout.pdf

Q: Example question?
A: Incorrect answer
B*: Correct answer
C: Another incorrect answer
EX: Optional explanation shown after answering.
---
```

Instead of the asterisk, use:

```text
ANSWER: B
```

Option labels can be letters, multiple letters, or numbers. There is no hard-coded four-answer limit.

## Journal Links

Paste a Journal Entry UUID such as:

```text
JournalEntry.abcdefghijklmnop
```

A Journal Page UUID also works:

```text
JournalEntry.abcdefghijklmnop.JournalEntryPage.qrstuvwxyz123456
```

Players are shown the linked Journal with temporary sheet ownership when Foundry permits it. The underlying Journal permissions are not permanently changed.

## Settings

- Hide Lore Launcher: client setting.
- Lore Launcher Location: client setting with eight positions.
- Allow Question Retakes: world setting.
- Shuffle Answer Options: world setting.
- Question Order: random unanswered or saved order.
- Players Can Browse Lore: world setting.
- Show Player Progress: world setting.

## Notes

- At least one active GM must be connected for a player answer to be recorded.
- The first active GM alphabetically by user ID processes scoring requests, preventing multiple GMs from recording duplicate attempts.
- Full JSON backups include scores. Individual text exports include the selected set's questions and lore, but not score history.


## Version 1.0.1 Fix

- Corrected the GM settings submenu to extend Foundry's required `FormApplication` class.
- Registered normal settings before the submenu so a submenu error cannot suppress every setting.
- Exposed the macro API during both `init` and `ready` for more reliable startup.
- Confirmed the launch macros remain:
  - `game.saltyBananaSlugLore.launch();`
  - `game.saltyBananaSlugLore.openManager();`


## Version 1.0.2 Fix

- Fixed players receiving the same question again after clicking **Next Question**.
- Tracks answered questions locally during the current quiz round so advancement does not depend on world-setting synchronization timing.
- Fixed sequential quizzes with **Allow Question Retakes** enabled repeatedly selecting the first question.
- Added **Start Another Round** after completing a set when retakes are enabled.
- Keeps the answered question stable while the correct/incorrect result screen is displayed.
