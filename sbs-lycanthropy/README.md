# SaltyBananaSlug’s Lycanthropy — 0.1.1

First test release for **Foundry v13 / dnd5e 5.2.x**. No additional modules required. Uses the Grim Hollow 2024 lycanthrope progression, not the older transformation rules.

## Updating from 0.1.0

Replace the existing module folder with this build and restart Foundry. Existing stages, boon choices, image paths, and normal-image backups are retained. Do not remove/reapply the curse. If already hybrid, the GM startup pass reapplies the configured token art; the Hybrid button can also refresh it. Open Token images and save if no image path was previously configured.

This patch updates both the regular token texture and the dynamic-ring subject texture, restores both originals, and temporarily disables prototype wildcard image selection. It does not change character portraits.

## Install

Install through the SBS Environment manager, or paste this into Foundry Setup → Add-on Modules → Install Module → Manifest URL:

`https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/manifests/sbs-lycanthropy.json`

For manual ZIP installation:

1. Close Foundry. Extract the **sbs-lycanthropy** folder from this ZIP into your Foundry User Data **Data/modules** folder.
2. Confirm the final path is `Data/modules/sbs-lycanthropy/module.json` (avoid a second nested folder).
3. Start Foundry, open the world, and enable **SaltyBananaSlug’s Lycanthropy** in Manage Modules.
4. Select a token and run the automatically created **SBS — Lycanthropy** macro. You can also open **Configure Settings → Module Settings → Lycanthropy manager** or use the moon button on an actor sheet.
5. Choose the actor and grant a stage. The owning player receives their pending choice prompt.

Stop using the earlier standalone macro. The module loads automatically on every client. Granting a stage replaces only documents tagged by that earlier SBS macro, so old and new form bonuses do not stack. Return the old macro to normal form before migrating if practical.

## Stage choices belong to the player

The GM grants stages 1–4. The player chooses **one boon for each granted stage** and acknowledges that stage’s **mandatory flaw**. These rules do not offer a choice among different flaws at a given stage.

The prompt shows the effects of the boon and flaw. If the player is offline or chooses later, the pending choice remains saved and can be opened from their sheet. On login the owning player is prompted again. For actors with multiple owners, the online player assigned that character is preferred; otherwise one online owner is chosen. The GM can resolve pending choices when needed.

Granting Stage 4 directly walks the player through all four choices in order. Reducing the granted stage removes the later selections and their generated benefits. Change granted stages while in normal form.

## Token images — temporary and form-specific

- Stage 1 asks for the **hybrid token image**.
- Choosing **Kindred Form** at Stage 2 asks for the **animal token image**.
- Either image can be skipped or changed later using **Token images** in the sheet feature.
- Hybrid images appear only in hybrid form. Animal images appear only in animal form.
- Reversion restores each linked token’s saved original image, including different originals on different placed tokens.
- **Character sheet portraits are never replaced**, including during the native animal transformation.
- The prototype token’s image also changes temporarily so newly placed hybrid tokens use the right art; it is restored on reversion.
- Foundry file browsing permissions still apply. Players can paste an existing image path if they cannot browse/upload.

## Player use

The module adds **Lycanthropy — Transform / Revert** to the character’s Features. Use its activity to open the form controls. Hybrid form adds native Claw/Bite attacks and the relevant bonus actions. Use those attacks normally, including the system’s attack/damage/critical workflows.

A GM must be online to process form changes and stage choices. Actions are serialized per actor. There is no need to run a macro after reloading.

## Implemented mechanics

| Rule | Behavior |
|---|---|
| Wolf hybrid | STR floor 18; walking Speed +10; Claw/Bite d8; Bonus Action Dash and conditional bonus attacks |
| Bear hybrid | STR floor 20; climb Speed based on walking Speed when form effects are synchronized; Claw d8; target-based post-hit grapple control and escape DC |
| Rat hybrid | DEX floor 18; Stealth expertise; Claw/Bite d6; Bonus Action Hide/Disengage and bonus attacks; proximity advantage for clearly opposing token dispositions |
| Lust for the Hunt | First crossing to half HP or lower since rest prompts DC 10 native WIS save; full-moon toggle auto-fails; failed save forces feral form |
| Feral restrictions | Blocks ordinary spell/equipment/class-feature activity use; adds turn reminders; prevents voluntary reversion |
| Feral recovery | At full HP at turn start, DC 10 WIS; success returns to normal unless locked by Ultimate Predator; Remove Curse ends form without curing the underlying transformation |
| Hunter’s Focus | One targeted creature within 60 feet; 1-hour mark; extra d6 on melee damage against that prey; dedicated advantage Perception/Survival checks to find it |
| Iron Pelt | Physical resistance in hybrid form; native magical/silvered weapon tags bypass it; avoids stacking with existing resistance |
| Kindred Form | Native system **2024 Polymorph** preset with Wolf / Black Bear / Giant Rat; animal stats, original HP and animal temporary HP, and native reversion |
| Silver Sensitivity | All forms; silvered physical weapon damage is vulnerable and existing resistance is canceled |
| Bestial Vigor | Maximum HP + character level, updated on class-item changes; hybrid turn start raises temporary HP to 5 if lower |
| Shapeshifter’s Savagery | Hybrid natural attacks gain d8 Slashing; Charmed/Frightened immunity |
| Frayed Thoughts | Disadvantage on INT ability checks, saves, and INT-based skills/tools using native roll hooks |
| Hybrid Form Affinity | Voluntary hybrid allows spells/concentration and normal speech; allied WIS roll advantage within 20 feet based on token dispositions; spell-component exemptions described in the feature |
| Savage Instincts | Additional d8 Slashing against a selected Bloodied target with hybrid Claw/Bite |
| Ultimate Predator | DM adjudicates sensed Bloodied/Unconscious creatures; WIS disadvantage, turn-start DC 15 save, Long Rest immunity reset, recorded hybrid kills lock reversion until next dawn |

Earlier stage benefits and flaws remain active as later choices are accepted. Normal form does not retain hybrid-only benefits. The extra Monstrosity type is recorded without replacing the actor’s existing creature type.

## Animal stat blocks

Kindred Form looks for the exact matching animal in your world, then Actor compendiums (preferring packs named for 2024). You can set an explicit animal actor UUID in the GM manager. If no stat block is available, it asks you to import the matching NPC instead of inventing statistics. No animal stat blocks are bundled.

Native animal transformation may create a temporary actor and switch the current scene’s linked tokens, as the dnd5e system normally does. Open the transformed token’s sheet for its animal statistics; the original actor remains available for native reversion. Unlinked tokens use the system’s synthetic-actor transformation/reversion. Do not combine this transformation with another Polymorph/Wild Shape operation on the same actor.

Equipment falling off in Kindred Form is announced but does not create item piles or move/delete inventory documents. Native transformation omits the original equipment while transformed and restores it on reversion.

## Adjudication and integration limits

- **Feral behavior:** the GM/player must move tokens, identify the nearest sensed creature, apply Bloodied priorities, and direct remaining attacks. The module does not move tokens or choose attacks for anyone.
- **Passive class features:** activity use is blocked while feral, but passive class modifiers contributed by other modules or manually entered values are not universally stripped. Adjudicate those manually. This avoids deleting or rewriting class data.
- **Action economy:** use Magic/Bonus Actions normally. Bonus-attack entries do not verify that the Attack action occurred. Bear grapple must be used only after a valid Claw hit; the module does not infer hits from AC.
- **Targeted damage:** select exactly one target before rolling Hunter’s Focus or Savage Instincts damage. Roll separately for multiple targets. Native damage application must receive the correct silvered/magical weapon properties; manually editing HP bypasses damage automation. Damage-overhaul modules can replace these native workflows.
- **Sensing:** DM checkboxes control whether Bloodied/Unconscious creatures are sensed. Sight, hearing and smell cannot be inferred reliably from token visibility alone. The Stage 4 turn-start prompt lets the GM update them. Update them in the manager for off-turn WIS saves.
- **Kills:** use **Record a kill** after an actual hybrid-form kill. Merely reaching 0 HP is not treated as a kill, since unconsciousness and death saves exist.
- **Dawn:** defaults to 06:00 in world time. Change the world setting, or use **Dawn reached** for custom calendars. Duration also uses world time; advance it during exploration.
- **Creature types:** core’s single type field remains intact. Adjudicate targeting that depends on the additional Monstrosity type. Integrations can use `game.modules.get('sbs-lycanthropy').api.creatureTypes(actor)`.
- **Affinity components:** casting is permitted; the feature explains the V/S and non-costly material exemptions. The module does not permanently rewrite individual spell components or bypass other modules’ component checks.
- **Range:** use scenes whose distance units are feet. Ally/enemy detection uses token dispositions; manually set advantage when a narrative relationship differs. Existing faster climbing movement is retained.
- **Concentration:** non-Affinity transformations end concentration via the native system method. Verify dependent effects with your automation modules.
- **Cleanup:** use module reversion/repair controls before disabling or uninstalling. Reverting removes this module’s form effects/items and restores token images. **Remove entire curse** is a GM exceptional cure/undo, not the Remove Curse spell.

## Validation and first test

23 automated regression tests pass, including every boon combination, stage selection sequencing, rejecting player stage grants, the prior HP-less-actor crash, token-specific image restoration, preserving portraits, core effect fields, native weapon activities, silver damage, feral restrictions, dawn locks, and the unlinked native reversion adapter.

These tests use mocked Foundry documents. No live Foundry server was available, and the separate browser UI smoke test could not run because Chromium was absent. This is a **first test release**, not a claim of verified compatibility with every installed module.

For the first world test:

1. Duplicate a character and place a linked token with an obvious original image.
2. Grant Stage 1; let its player choose a form and temporary token image.
3. Click the sheet feature, transform, and verify stats, attacks, token art, and unchanged portrait.
4. Revert; verify original stats/art return. Reduce HP through the Bloodied threshold to test Hunt.
5. Advance stages and choose the desired boons. For Kindred Form, ensure its 2024 beast stat block is available.

Run developer tests with `node --test tests/*.test.mjs` from the module folder.

## Sources

Mechanics reference: [Grim Hollow 2024 Lycanthrope](https://5e.tools/charcreationoptions.html#lycanthrope_grimhollowpg24) and its linked options, pp.154–157.

Implementation references: the official [Foundry v13 API](https://foundryvtt.com/api/v13/) and [dnd5e 5.2.x source](https://github.com/foundryvtt/dnd5e/tree/5.2.x). The package contains original code and short mechanical summaries, not copied book pages or artwork.
