# Changelog

## 0.2.5
- Changed **Follow Token** attachment from double-click to **single-click** while the dedicated token picker is active.
- Added capture-phase token picking so merchant, container, Item Pile, and other token interactions cannot steal the same click before Danger Zones attaches.
- Added direct per-token pointer listeners as a fallback for third-party token implementations that stop normal event bubbling.
- Follow Token placement now explicitly suppresses the picked token's normal open-sheet/store/container action for the attachment click only; normal token interaction resumes immediately afterward.
- Updated Follow Token instructions and notifications to explain the single-click picker.

## 0.2.4
- Fixed **Follow Token** tracking during animated/long-distance token movement. Attached zones now refresh against the token's rendered center while it moves instead of relying on a single `updateToken` redraw.
- Followed directional zones also track token rotation continuously when **Match the token's rotation** is enabled.
- Updated Follow Token instructions to explicitly say to **double-click the token** to attach the zone.
- Added **Restrained by Walls** to the target-behavior page.
- Wall-restrained zones use movement-blocking walls as line-of-effect barriers: tokens behind a solid/closed wall are outside the zone's effective area.
- Wall-restrained overlays are visually clipped by Foundry's wall sweep polygon so the warning area matches the effective area.
- Safe Zones also respect wall restraint: a token geometrically inside the safe shape but cut off from its origin by a wall is not considered protected by that zone.
- Wall-restrained zones automatically refresh when walls are created, edited, or deleted.

## 0.2.3
- Reworked **Follow Token** placement into an actual token-picking mode.
- Following zones now preview by snapping to the token under the pointer.
- Clicking empty ground no longer places or offsets a following zone.
- Clicking a token attaches the zone centered on that token with zero offset.
- Follow Token no longer requires selecting a token before opening the wizard.
- Existing selected/followed tokens are still shown as a convenience, but the GM may click a different token during placement.
- Added a bounds hit-test fallback for reliable token picking.

## 0.2.2
- Fixed **Delete after resolve** so finished one-shot zones are removed from Scene data before their hazard Combatant is deleted, preventing combat hooks from re-arming/resurrecting the zone.
- Launcher cards are now the actual clickable DialogV2 actions; the redundant footer row is hidden on the launcher.
- Launcher tiles and dialog action buttons now wrap long text instead of clipping it.
- Improved long-choice/select sizing.

## 0.2.1
- Rebuilt rectangle, line/beam, and cone rendering to use explicit Pixi path geometry rather than raw polygon arrays.
- Rebuilt Ring rendering without `beginHole/endHole`; rings are now true annuli with a visibly empty center.
- Isolated canvas rendering per zone so one malformed/broken zone can no longer stop every other zone from rendering or refreshing.
- Fixed zone deletion ordering: Scene data is removed before encounter-tracker Combatants so combat hooks cannot race the deletion and re-arm the hazard.
- Single-zone deletion also removes stale/duplicate tracker Combatants carrying that zone's module flag.
- Added **Clear Scene Zones** to the launcher and Active Zones manager. It clears Danger Zones from the currently open Scene only, with confirmation, and leaves every other Scene untouched.
- Active Zone cards now show the actual configured shape dimensions/rotation to make shape problems easier to spot.

## 0.2.0
- Reworked timing into three explicit modes: **Countdown Once**, **Repeat**, and **Manual**.
- Fixed encounter detection by using Foundry v13's `game.combats.active`, `viewed`, and scene combat collection.
- Switched countdown processing to Foundry v13's dedicated `combatTurnChange` hook.
- Timed zones now create and recover actorless encounter-tracker Combatants with real initiative values.
- Added duplicate turn-boundary protection so an activation cannot accidentally fire twice from overlapping combat events.
- Fixed one-shot zones left on the map from firing again on later rounds; they now become resolved and leave the tracker.
- Added automatic migration for zones made with v0.1.x timing fields.
- Rebuilt the wizard into five smaller pages and made the window resizable with a dedicated scrolling content body.
- Repeat-only movement/pattern controls are now shown only for repeating zones.
- Added clearer countdown wording and tracker status badges in Active Zones.
- Added built-in **Falling Boulder** and **Healing Zone** presets.
- Built-in and saved presets can now be **Placed As-Is** or **Customized** before placement.
- Existing launcher macros refresh to the current command and Zones icon automatically.

## 0.1.1
- Fixed Foundry v13 `DialogV2` launcher/wizard crash: `config.content element must have no attributes`.
- The DialogV2 root content element is now a plain attribute-free `<div>`, with Danger Zones styling moved to an inner wrapper.

## 0.1.0
- Initial build of **SaltyBananaSlug's Danger Zones**.
