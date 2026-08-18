# SaltyBananaSlug's Danger Zones

A GM-focused Foundry VTT v13 module for MMO-style telegraphs, boss called attacks, falling objects, pendulums, trap warnings, safe zones, healing fields, and other tactical areas.

## Launching it

The module automatically creates a GM script macro named **Danger Zones** using the custom **Zones** banana-slug icon and attempts to place it in the first empty hotbar slot. It adds no permanent scene-control buttons.

## Activation styles

Danger Zones v0.2 separates timing into three clear behaviors:

- **Countdown, then fire once** — for falling boulders, called boss attacks, delayed explosions, collapsing ceilings, and similar one-shot telegraphs.
- **Countdown, then repeat** — for pendulums, lava pulses, rotating beams, healing fields, and recurring mechanics.
- **Manual only** — no tracker entry; use **Active Zones → Fire Now** whenever the GM wants it to resolve.

Timed zones receive their own actorless Combatant in the encounter tracker. The bracketed number in its name is the number of that hazard's turns before the next activation.

Example: `⚠ Falling Boulder [2]` becomes `[1]` on its first hazard turn and resolves on its second hazard turn.

## Built-in presets

Two presets are always available even in a brand-new world:

### Falling Boulder
- 10-foot circle
- Orange danger overlay
- Top-of-initiative actorless hazard
- 2-turn one-shot countdown
- DC 14 Dexterity save
- 4d10 bludgeoning damage
- Half damage on a successful save
- Deletes itself after resolving

### Healing Zone
- 10-foot green circle
- Bottom-of-initiative actorless hazard
- First pulse on its next hazard turn
- Repeats every hazard turn
- Heals 1d8+3 to qualifying tokens inside

Presets can be **Placed As-Is** with one map click or opened through **Customize** first.

## Shapes and appearance

- Circle
- Rectangle
- Cone
- Line / beam
- Ring
- Custom overlay color
- Opacity
- Pulsing overlay
- Canvas label and countdown
- GM-only or player-visible zones
- Delayed reveal based on remaining countdown
- **Safe Zone** inversion: qualifying tokens outside the shape are affected

## Effects

Any combination can resolve together:

- Saving throw
- Damage formula and damage type
- Healing formula
- Chat message
- GM notification
- Sound
- Optional macro execution

Target selection is evaluated when the zone actually fires, so moving out of a called attack works as expected.

## Repeating mechanics

Repeating mode has a separate first countdown and repeat interval. Optional changes between activations include:

- Move X/Y in scene-distance units
- Rotate
- Grow/shrink radius
- Grow/shrink width
- Grow/shrink length
- Ping-pong the transform direction for pendulum-style mechanics

These controls are only shown for repeating zones; one-shot countdown attacks no longer have to wade through repeat settings.

## Active Zones manager

- Fire Now
- Delay +1 hazard turn
- Hide / Reveal
- Edit
- Duplicate
- Save as Preset
- Delete
- **Clear Scene Zones** — removes every Danger Zone from the currently open Scene only; other Scenes are untouched
- Arm timed zones to the current scene encounter

## Installation

1. Extract the `saltybananaslugs-danger-zones` folder into Foundry's `Data/modules/` directory.
2. Restart Foundry.
3. Enable **SaltyBananaSlug's Danger Zones** in Manage Modules.
4. Log in as GM and use the automatically created **Danger Zones** macro.

## Target environment

- Foundry VTT v13
- D&D5e 5.2+

## v0.2.x implementation notes

- Combat arming now looks up the active/viewed combat from Foundry's `game.combats` collection rather than relying on a single legacy combat reference.
- Turn resolution uses Foundry v13's post-update `combatTurnChange` hook.
- Actorless combatants store the Danger Zone ID in module flags so stale tracker links can be recovered.
- Damage uses D&D5e's native `Actor#applyDamage` when available and falls back to direct HP updates if the system call fails.
- Healing applies directly to HP up to the actor's maximum.
- Existing v0.1.x zones are migrated in memory to the new Countdown / Repeat / Manual behavior model.


## Shape reliability

Version 0.2.1 uses explicit canvas path geometry for rectangles, beams, and cones, and renders rings as a true annulus rather than relying on a graphics-hole operation. Each zone is rendered independently, so a malformed zone cannot prevent other zones from refreshing or being removed.


## Token Following
Enable **Follow Token** in the wizard, finish the setup, then hover and **single-click** the token you want the zone attached to. While the token picker is active, Danger Zones temporarily captures that click before normal token interactions, so merchant/container tokens which normally open on click or double-click can still be chosen as anchors. The preview snaps to tokens; clicks on empty ground are ignored. Attached zones stay centered on the chosen token throughout animated and long-distance movement rather than updating only once at the beginning of the move. **Match the token's rotation** also keeps directional shapes aligned to the token while it turns.

## Restrained by Walls
Enable **Restrained by Walls** under **Behavior & Targets** when a zone should stop at solid barriers. The module uses movement-blocking Scene walls as line-of-effect boundaries, clips the visible telegraph to the reachable area, and excludes tokens cut off from the zone origin by a closed/solid wall. Safe Zones use the same effective-area logic, so a wall can also block a protective/healing area from reaching a token.
