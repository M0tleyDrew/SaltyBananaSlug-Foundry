# SaltyBananaSlug's Campaign Macros

Character automation, utilities, and launchers made for the campaign, collected in one place. This is a source collection: these scripts are copied into Foundry manually and are not automatically installed by SBS Environment.

## Install a macro

1. Open the linked `.js` file and click **Raw** to copy its entire contents.
2. Create a macro in Foundry and set its type to **Script**.
3. Paste the code, name it, save it, and put it on the hotbar.
4. Follow the entry's requirements below. Normal Foundry ownership and permissions still apply.

The target environment is Foundry VTT v13 with dnd5e 5.2.x. Module launchers require their named module. Collection syntax checks do not establish live compatibility; recovered scripts retain their original behavior.

## Character automation

| Macro | Purpose | Requirements and status |
| --- | --- | --- |
| [Armor Models](character/armor-models.js) | Switch Guardian, Infiltrator, or Dreadnaught armor models; add model weapons, features, passive effects, and counters. | Latest standalone v3 replacement; no older repair macro needed. Select an owned token or use your assigned character; requires equipped armor and an Artificer/Armorer. Native dnd5e handling with optional Midi-QOL attacks. Simulated checks passed during development; live validation remains pending. |
| [Moon's Inspiration](character/moons-inspiration.js) | Minimize sheets, pick a teleport destination within 30 feet, apply Invisible, and choose an inspiration recipient within 60 feet. | Requires Midi-QOL, an active GM, the existing Moon's Inspiration feature, and an owned bard token. Consumes one Bardic Inspiration use; cancellation/failure attempts to refund it. Recipient spends the inspiration die manually. |
| [Set Up Moon's Inspiration](character/setup-moons-inspiration.js) | Connect the sheet feature to the main macro. | GM runs once after creating the main world Script macro named **Moon's Inspiration**. Wires the feature's Midi-QOL pre-item-roll macro, grants the owning player access, and suppresses the native roll to avoid double consumption. |

Armor Models includes session hooks/timers for some cleanup: rerun after a world reload to restore those handlers. Enemy movement, attack penalties, and some reach interactions still require manual adjudication. Adding a named feature to the sheet does not imply every part of its rules is automated.

## Utilities

| Macro | Purpose | Requirements and notes |
| --- | --- | --- |
| [Toggle Player List](utilities/toggle-player-list.js) | Show or hide Foundry's normal online-player list for your client. | Original session toggle. Party Viewer v0.4.2 also provides a persistent hide setting, which is preferable for automatic hiding. |
| [Toggle 180° Vision](utilities/toggle-180-vision.js) | Toggle selected tokens between 180° and 360° sight. | Enables sight and updates selected tokens; requires token update permission. |
| [Set 180° Vision](utilities/set-180-vision.js) | Set all selected tokens to 180° sight. | Enables sight; requires token update permission. |
| [Token Statblock as Text](utilities/selected-token-statblock.js) | Display/copy a selected token's statblock, with exactly one targeted token as a fallback. | Uses the token's actor. Non-GMs need Observer access; this does not bypass permissions. Recovered source; live validation remains unconfirmed. |

## Module launchers

| Macro | Opens | Required module |
| --- | --- | --- |
| [Web Viewer](launchers/web-viewer.js) | Web Viewer window | `saltybananaslug-web-viewer` |
| [Card Games](launchers/card-games.js) | Card Games launcher | `saltybananaslug-card-games` |
| [Actor Journal](launchers/actor-journal.js) | Actor Journal | `saltybananaslug-actor-journal` |
| [Lore](launchers/lore.js) | Player/GM Lore window | `saltybananaslugs-lore-module` |
| [Lore GM Manager](launchers/lore-gm-manager.js) | Lore management window | `saltybananaslugs-lore-module`; GM management access |

The Actor Journal, Card Games, and Lore launchers are convenience copies of the original scripts in their module folders. Update both copies if their APIs change. Other SBS modules may create their own launchers in the world; this table lists recovered standalone launcher source.

## Older scripts

The [archive](archive/README.md) preserves five superseded scripts and explains their replacements. Start with the current entries above.

## Recovery inventory

This folder contains **12 current scripts and 5 archived scripts**. Source was recovered from saved macro files, original module macro folders, and the exact vision/player-list code from the conversation. Recovered JavaScript files were copied without rewriting their mechanics; descriptions and organization are new.

These previously discussed macros still need their complete original source recovered before they can be added:

| Macro | Recovery status |
| --- | --- |
| Token Art Show | Purpose known; complete original script unavailable. |
| UI Fixer / Force Current Window Scroll | Purpose known; complete original script unavailable. |
| Character Creator / PC Generator | Purpose known; complete original script unavailable. |
| Actor / Module Manifest Export | Complete original script unavailable. |
| Random Events / To Oka-Ola table launchers | Table data is separate from launcher code; original macro scripts unavailable. |

Infusions automation was discussed as future work and is not included as a completed macro. To fill the remaining gaps later, export the corresponding world macros from Foundry and add their original code here.
