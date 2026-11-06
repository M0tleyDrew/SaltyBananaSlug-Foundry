# Replicate Magic Item v1.0 — testing version

For Foundry v13 and dnd5e 5.2.x, using the published 2025 Eberron: Forge of the Artificer class. This is a standalone Script macro, not the older Infuse Item feature and not a playtest implementation.

Copy [the complete script](replicate-magic-item.js) into a Script macro. An owner selects their Artificer token, or uses their assigned character, and runs it. The GM can also run it on that character. Initial use asks for known plans; subsequent use opens the manager. Use one client at a time for the same character.

## What it manages

- Known plans by Artificer class level: 4 at 2, then 5/6/7/8 at levels 6/10/14/18. Character total level does not grant extra plans.
- Creation/active limits: 2 at 2, then 3/4/5/6 at 6/10/14/18.
- Level 9 Armorer: an additional Armor-category plan (including magic shields) and an additional active/creation allowance that cannot be filled by a non-Armor item.
- One optional plan replacement per newly observed Artificer level. Replaced-plan items vanish; declined opportunities cannot be reopened by rerunning the macro. Initial setup at a higher level chooses the current allowance; it does not reconstruct past level-up decisions.
- Real item copies, normal attunement capacity (3, then 4/5/6 at Artificer 10/14/18), creation allowance recovery through normal Foundry Long Rests, and one creation per plan per rest.
- The oldest tracked item vanishes when a new creation exceeds the active limit. Container contents are detached first rather than destroyed.
- Level 6 Charge: spend a native spell slot to restore item-level charges. Drain: destroy a Common/Uncommon/Rare item for one extra level 1/2/2 slot, once per Long Rest. The extra available slot can put the current slot count above its normal maximum; a normal Foundry Long Rest returns it to the normal maximum.
- Level 6 Transmute: exchange one replicated item for another known plan, once per Long Rest. This does not consume the rest's creation allowance or grant immediate attunement.
- Level 20 Cheat Death: manually trigger at 0 HP after confirming the character was not killed outright, select qualifying items, and disintegrate them to change HP.
- GM-recorded actual death: roll and record the 1d4-day expiration. Expiration checks run on macro invocation and game-clock advances while the session monitor is running. Unconsciousness is not automatically treated as death.

## Item data and variants

The macro contains the named plan list and tier gates. It reads accessible World Items and visible Item compendium indexes; it does not download proprietary item descriptions, create empty placeholder equipment, or list other characters' inventories as templates.

Import the updated magic items into a compendium the player can read. The copied item's own activities, effects, attacks, and charges determine its sheet behavior. A broken or incomplete source document stays broken when copied. Explicitly marked 2014 sources are excluded; templates without source metadata still require review.

Common-item wildcard candidates exclude Potion/Scroll categories. Uncommon/Rare Wondrous candidates use explicit equipment category metadata. Curse mentions cause conservative rejection. Misclassified imports, unusual Wondrous categories, and concrete variants of generic weapon/armor plans need GM review via **Approve template**. The GM confirms the actual category, rarity, lack of curse, edition, and mechanics. This is not an unrestricted player override. Each wildcard item is a separate plan; concrete variants of a named plan share its identity. Available approved variants can be selected at creation without spending a plan replacement.

## Permissions and manual steps

Timing, tools in hand, touch/range, and attunement prerequisites are confirmed by the user; the macro cannot infer those reliably from an inventory. Normal equipment use and attunement still apply. Source item quantity is preserved, including paired-item representations.

Transferred items retain creator/serial flags where the transfer preserves item flags. The macro scans readable world actors and current-scene synthetic actors, then checks the original UUID. If it cannot locate exactly one copy, or cannot modify its holder's sheet, it stops. The GM can reconcile a changed owned-item UUID or retire a ledger entry only after confirming the actual item was destroyed. Items in inaccessible storage or unloaded scenes may require that reconciliation. Do not run this simultaneously from player and GM clients.

Resources are native recoverable feat counters; don't reset or delete them manually. Expiration monitoring is session-scoped: rerun after reloading. Advance Foundry's game clock for days to pass. This is a macro, so it cannot perform offline or unattended world-wide maintenance. It does not automate Spell-Storing Item, ordinary crafting, Flash of Genius, or every item's individual rules.

## Validation

`node macros/tests/replicate-magic-item.cjs`

The fixture exercises setup, level limits, creation and duplicate-per-rest prevention, charge/spell-slot spending, Drain/Transmute limits, native-counter rest recovery, attunement restrictions, ownership failures, failed-write rollback, oldest-item replacement, container-content release, Armorer bonuses, level-up replacement, Cheat Death, and delayed expiry. These are simulated documents, not a live Foundry integration test. Test on a duplicate character before using it in the campaign.

Rules reference: [Wizards' published Artificer overview](https://www.dndbeyond.com/posts/2106-whats-new-with-the-artificer-in-eberron-forge-of). Exact plan tables and feature timing target the published Eberron class, not the earlier UA. Native resource, rest, attunement, and spell-pool handling were checked against the dnd5e release-5.2.4 source.
