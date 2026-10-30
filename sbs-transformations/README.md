# SaltyBananaSlug's Transformations · 0.1.3

A Foundry VTT module for all twelve transformations from **Grim Hollow: Player's Guide (2024)**. This is the first framework test build, targeting **Foundry 13 and dnd5e 5.2.4**. It has passed headless rules/adapter tests; it has not yet been verified inside a running Foundry world. Other system versions are not declared compatible.

## Install and use

1. Extract the ZIP and replace the `sbs-transformations` folder in Foundry's `Data/modules/` folder. Restart Foundry and enable the module.
2. Select **one token** and run **SBS — Transformations** from the Macro Directory/hotbar.
3. If the token has no transformation, pick one. Its description appears below the picker. Apply **Stage 1 — I’ll choose**, or **Stage 1 — leave choices for player** when an owner is online.
4. The choice window shows each available boon and its mechanical description, the automatic boons, the required flaw and its description, and optional temporary token art for this stage. Confirm to apply the chosen boon and required flaw to the sheet.
5. Run the macro again for that token to open its **stage editor**. Use **Add Stage 2**, and later Stages 3–4. Choose for the player or send the next stage's setup to their online owner.

**Use selected token** switches the current window to your new selection. No actor-list search is required. If no token is selected, the macro asks you to select one.

The module opens only when you run its macro, use its transformation-controls sheet feature, or explicitly open its settings menu. Sheet opens, actor/user updates, startup and login never launch setup. Closing a prompt leaves choices pending. Players run the macro for their token to finish; the DM can use **Choose for player** instead. Leaving choices for a player saves them without forcing a popup on that player’s screen.

Completed stages are collapsed sections containing their actual boons/flaws and descriptions. The DM can reopen a stage's choices; that also reopens later stages so prerequisites remain valid. More specialized controls, uses, trackers, suspension/removal, migration and definition editing are under **More controls** / **Advanced**.

Existing records from 0.1.0/0.1.1 are retained. You do not need to remove and reapply an existing transformation: select its token, run the macro and finish its pending choices. A legacy SBS Lycanthropy actor offers migration rather than creating a duplicate.

The module targets Foundry 13 / dnd5e 5.2.4. It uses a macro launcher, with no permanent screen button. Install/update through SBS Environment or Foundry’s Install Module window using:

`https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/manifests/sbs-transformations.json`

The catalog workflow generates a Foundry-ready install ZIP; manual folder installation also remains supported.

## All twelve

Aberrant Horror, Fey, Fiend, Hag, Lich, Lycanthrope, Ooze, Primordial, Seraph, Shadowsteel Ghoul, Specter, and Vampire.

The catalog contains **175 staged boons/flaws and nine separate Fiend contract gifts**. It uses authored mechanical summaries; consult your book for the complete rules, narrative requirements, and edge cases.

## Choices and progression

The GM controls transformation assignment, granted stages, resets, suspension, exceptional removal, and world definitions. Players choose available boons and internal choices, use their features, manage their form art, and record contextual trackers.

- Options are limited to that transformation's own feature pool, the stage currently pending, and satisfied prerequisites.
- Validation runs again when the GM processes a selection. Invalid cross-transformation choices, future-stage boons, flaws submitted as boons, duplicates, and incorrect choice counts are rejected.
- Required flaws are displayed with the boons and granted automatically on acceptance. The source generally specifies a fixed flaw at each stage; these are not interchangeable flaw menus.
- Stages complete in order, even when the GM grants Stage 4 at once. Automatic features are distinguished from chosen boons.
- Vampire chooses two boons at Stages 2 and 3. Shadowsteel Ghoul chooses two at Stage 2 and automatically gains Cursed Claw at Stage 3. Other automatic grants follow their transformation's rules.
- Eldritch Aberration checks for spell slots; Sangromancy Specialist checks for a known cantrip. Elemental affinity choices must be different.
- Fiend gifts use their own contracted, unlocked pool. A new signed contract can activate its gift immediately, with an explicit replacement if active slots are full; existing contracted gifts use the appropriate rest to switch. They cannot be selected as ordinary boons or acquired by another transformation.
- One active transformation per actor is the default. The GM can enable combinations as a house-rule exception; replacement body forms remain mutually exclusive.

Use **Set granted stage** to level up or down. Use **Redo choices from selected stage** to clear that stage and all later choices. Return to normal form and end manifestations first. Suspension removes managed benefits while retaining choices. Removal deletes this module's managed documents for that record and restores saved appearance; it is a GM exceptional cure, not an ordinary Remove Curse casting.

## On the character sheet

Each completed transformation generates a **Transformation Controls** feature plus its selected boons and required flaws. Use the controller's activity to open its controls. Configured attacks, saves, damage/healing rolls, limited-use counters, and manifestations appear as ordinary dnd5e activities. Native rest workflows recover native item counters.

The module adds reversible actor effects for configured ability increases, speeds, senses, resistances, vulnerabilities, proficiencies, condition immunities, and maximum-HP changes. Attacks and save DCs refer to live ability scores. It preserves unrelated actor items and effects.

Additional creature types appear in the controller and `game.modules.get('sbs-transformations').api.types(actor)`. Core's single creature-type field is preserved. Other modules will not automatically know about the extra types unless they use this API.

## Temporary token artwork

Each stage's choice window includes optional token image fields for the forms that stage unlocks. Previously chosen art is offered as the starting value. You can change it later through **Stage token art**, selecting the stage to edit.

Artwork is stored separately for each stage and form. The active stage uses its own selection; if none was set, it inherits an earlier stage's selection or the old module-wide image. A deliberately blank saved field keeps the normal appearance. Lowering the granted stage uses that earlier stage's art again.

Hybrid, animal, Ooze and other manifestations use only their corresponding images. Transformations without a special body form have an optional **Revealed appearance** / **Revert** control. Changing appearance does not remove the underlying transformation's always-on rules.

Token textures and dynamic-ring subject textures are updated together. Each placed token's original art is saved and restored when reverting. The prototype token is temporarily updated for newly placed linked tokens, then its art and random-image setting are restored too. **Character portraits (`Actor.img`) never change.** Blank fields leave the matching form's art unchanged/normal. File browsing/upload permissions remain governed by Foundry.

If multiple visual manifestations overlap, the last activated image is displayed; ending it restores normal art. Use the body form's art for a single consistent appearance.

Kindred Form uses dnd5e's native 2024 Polymorph workflow with a Black Bear, Giant Rat or Wolf from the world or an accessible compendium. Native transformation behavior and token linking still require in-world verification in this build.

## Automation boundaries

All twelve catalogs and their progression/choice rules are included. This is **not full combat automation for every feature**. A rule card marked **manual** is a reference/GM-assisted feature. **Assisted** means configured activities/effects exist; it does not imply every sentence of the feature is automated. See **COVERAGE.md** for all 184 entries.

Configured assistance includes Lycanthrope forms, natural attacks, Bloodied Hunt saves, feral restrictions, reversion and expiry, silver sensitivity, prey damage with a single targeted creature, and turn-start effects. Other transformations receive configured passive effects, native activities/counters, forms/manifestations, and context-specific trackers. Unstable Form has a complete stage-dependent d100 table; fatal results require GM resolution rather than automatically killing the character.

The following require player/GM decisions or manual application where the native activity does not explicitly handle them:

- Narrative prerequisites, bargains, sacrifices, alignment, disguises under stress, hostility, sight/hearing/smell, full moon, sunlight, hallowed ground, silver/magic damage tagging, and target eligibility.
- Compelled movement/target selection, action economy, multiattack limits, once-per-turn riders, follow-up saves, condition ending clauses, area geometry, auras affecting other actors, and creature immunity periods.
- Item/equipment transformations, minions/summoning, possession/control, Legion of Slime bodies, multi-concentration, soul resurrection timing, special spell-slot expenditure, and custom calendar events.
- Bite drain healing, Strigoi's conditional Bite damage, additional bloodline spell uses, some Mastery riders, and detailed corruption/feeding consequences.
- Constitution omission on Unstable Form Hit Dice healing, reaction/initiative consequences outside native activities, fatal/ash outcomes, and revival-level requirements.

Native save activities post configured saving throws and damage; use normal Foundry target/damage/effect application. They do not silently apply all results to other actors. Read each feature's summary and action notes before applying its secondary consequences. Evil Eye, for example, needs the GM to set eligible failed-save targets to zero HP instead of applying the displayed successful-save damage.

A GM must be online to process player form/choice/tracker requests. Use the standard dnd5e activity/rest/damage workflows for the corresponding hooks. Direct manual HP edits can trigger Bloodied detection but do not identify Radiant damage; use that tracker when necessary. Combat turn hooks provide turn effects, and advancing world time provides timed expiry.

## Edit definitions

The GM manager includes **Edit transformation definitions**. Edit names, mechanical summaries, manual steps, effects, and activity descriptors. The advanced JSON editor exposes stage pools, automatic grants, choice counts, prerequisites, internal choices, and uses. Export/import definitions as JSON, reset a built-in definition, or duplicate it as a custom variant.

Definitions use isolated IDs (`transformation:feature`). Imports with foreign feature pools/prerequisites, invalid stages, duplicate IDs, or unsupported action kinds are rejected. Edits that invalidate an existing actor's choices are rejected until those choices are reset. Arbitrary JavaScript is not accepted as a descriptor. Custom copies inherit their base transformation's named behavior; renaming behavior-sensitive built-in feature names can disconnect that specialized automation, so adjust summaries/display names with care.

World edits are stored in settings, independent of bundled defaults. Advanced effect formulas support numeric arithmetic and `@stage`, `@prof`, `@level`, `@walk`, and ability modifiers. Supported activities: attack, save, damage, heal, temphp, form, toggle, spell, reference. This is a developer-oriented editor, not a drag-and-drop rule designer.

## Migrate SBS Lycanthropy

1. Revert any old **animal/Kindred Form** first. A normal or hybrid legacy form can be migrated.
2. Enable the new module. The GM manager detects old `sbs-lycanthropy` actor data and offers **Preview Lycanthropy migration**.
3. Review the preview and migrate. It carries over stage choices, form state, hybrid/animal image paths, and saved normal-token image backups, replacing only the old module's managed items/effects.
4. Test the migrated actor, then disable the old module. Do not manage the same actor with both modules. Migration keeps a rollback copy of the old flags/items/effects; **Roll back Lycanthropy migration** restores it.

Rollback restores the saved old state, not subsequent new-module changes. It leaves unrelated items and other transformation records intact. This migration targets the SBS Lycanthropy module's data schema; it does not import arbitrary earlier standalone macros.

## Developer checks

Run `npm test` in this folder with a modern Node release. No dependency installation is needed.

The included tests cover all 12 catalogs/184 feature adapters, 581 legal stage transitions across the boon paths, invalid choice submissions, prerequisites, selection exceptions, gift validation, d100 table coverage, actor lifecycle, migration/rollback, native activity formulas, resource charging, cumulative ability caps, temporary token/ring restoration, unsupported actors, and startup/launcher registration. These are headless mocks and pure-rule tests, not a substitute for Foundry world testing.

## Credits and license

Module code and original artwork: SaltyBananaSlug. Code is distributed under the MIT License in LICENSE. Grim Hollow names and mechanical references belong to their respective owners; this is an unofficial community tool, not an official Ghostfire Gaming or Foundry product. The included summaries are concise mechanical references, not a bundled copy of the book.

Rules reference supplied for the project: https://5e.tools/book.html#grimhollowpg24,6

## Changes in 0.1.1

The manager opens directly on the selected token, shows the actor being managed, and includes **Use selected token** for switching without searching. The full actor list is collapsed by default. Selecting multiple tokens or an unsupported/unowned token produces a prompt instead of silently choosing a different actor. The launcher, manager, and generated features now use the transforming-slug logo.

### Logo asset

`assets/transforming-slug.png` was generated with the built-in image-generation tool. Prompt: a single continuous slug transforming into a werewolf, with a curled smooth slug tail becoming a furry wolf chest, clawed forelimb and howling muzzle; retain two slug eyestalks. Forest green, antique gold and pale sage fantasy guild emblem; bold contours, no text, true transparent background.

## Changes in 0.1.2

Replaces the main manager with token-first setup and a focused stage editor. Applies Stage 1 first, prevents duplicate assignment, routes setup to the chosen DM/player with an offline-DM fallback, displays boon/flaw descriptions, and stores temporary token art per stage and form. Pending prompt windows recover after a render failure and close when handed off or completed. Specialized controls remain available separately.

## Changes in 0.1.3

Removes automatic startup/login and actor/user-update launches. Background mechanics continue running; they cannot open the setup/editor. Pending choices remain saved and are accessible through an explicit macro/feature launch.
