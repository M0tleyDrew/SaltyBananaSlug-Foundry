# Validation — 0.4.1

Validation completed 2026-11-12 (America/New_York).

* **268/268 automated rule, service, settings, and notice tests passed.** Run `node --test tests/*.test.mjs` from this folder.
* **102/102 DOM interaction checks passed** in a jsdom host with simulated Foundry APIs.
* All shipped JavaScript/ES modules passed Node syntax checks.
* Module manifest references resolve to included files.

The Mending picker checks include clicking an unlinked token, cancelling map selection with Escape, and refreshing HP after its inventory changes.

Automated coverage includes wear carryover, critical exemptions, each distinct break, immediate destruction at the third break, preserved wear/break history after repairs, partial repair quantities, material stack allocation, repair prerequisites, ownership checks, direct-API combat locks, combat starting during a check, duplicate/stale requests, simulated player-to-GM socket round trips, paid quotes, rarity prices, material discounts, failed repairs, and refunds on failed item commits.

New coverage verifies full-HP defaults for pre-existing unconfigured equipment, preservation of saved 0 HP/history, native Unbreakable properties, derived enchantments, flag fallback, property removal, timed/manual protection and exact expiry, protected wear without a backlog, protection without healing, armor wear independent of attack damage, equipped-body-armor selection, excluded shields, per-item/campaign wear amounts, armor third-break destruction, hit/miss/critical/AC handling, and deduplication.

Damage-dice coverage verifies the one-step die ladder, multiple dice and flat bonuses, flavors/modifiers, exact half-HP thresholds and odd maximum HP, unchanged source damage data, separate riders/ammunition, critical configuration, versatile mode changes, repeated/clone dialog builds, repairs restoring full dice, and HP changes while a dialog is open. UI checks also confirm 0 HP and destroyed weapon blocking, enforced legacy settings, and that Unbreakable does not revive unusable items.

DOM checks cover the tracker opening only when launched, durability percentages, the two-break warning, inventory search, partial repair dialogs, combat locking, GM HP edits triggering destruction, removed repair options for destroyed items, idempotent native-sheet badge insertion, setup saving, paid repair quotes and approval, broken-item activity blocking, damage-roll deduplication, and native critical-roll recognition.

Version 0.2.0 coverage adds all physical-item tracking while unequipped; ordinary-item profile selection; rarity, material, quality, intensity and fractional wear; saved HP preservation and GM recalculation; shared-stack prices and supplies; and one-time migration of old default profiles without reapplying it on later joins.

Fix All tests verify aggregate quotes, shared-supply allocation, separate checks only on broken items, failure supply rules, ownership and destroyed-item restrictions, combat starting during a check, stale quotes, paid batch approval, failed professional repairs without charges, duplicate approval rejection, tool-use recording, and rollback of failed inventory/payment commits.

Notice tests cover player/GM content, each user's saved version, first use versus skipped-version updates, repeated joins, world-wide disabling, manual Help, temporarily downgraded versions, and matching manifest/package/release versions. Added DOM flows exercise unequipped rope use, duplicate native activity hooks, direct charges, native charge/activity double-count prevention, ammunition, self and paid Fix All, both guide roles and global disabling, calculated profile HP, fractional armor rates, and clearing overrides back to campaign defaults.

The runtime API/hook implementation was checked against the D&D5e `release-5.2.4` source and Foundry's v13 API documentation. A running licensed Foundry world was not available. **Actual visual layout, real network transport, and third-party module interoperability have not been verified in-world.** See the README's short in-world check.

Repair time is displayed and logged as downtime. It does not automatically advance the world clock.

Version 0.2.1 regression checks reproduce native title-bar controls, close transitions with late item updates, closed-window render attempts, both scroll positions during refresh, and item changes resetting detail scroll. A representative native fixed-height button rule is loaded before the module stylesheet; computed styles verify that inventory rows use automatic height with no flex shrinking. This does not substitute for visual inspection in the user's Foundry theme/scale. Local Chromium could not launch in this environment.

Additional service and DOM tests cover automatic weapon/armor tracking for world NPCs and unlinked tokens without initialization, modern armor type data, HP and temporary-HP damage while the tracker is closed, repeated hook delivery, healing and zero damage, unequipped and Unbreakable armor, primary-GM arbitration, mutually exclusive trigger modes, actor/token target resolution, lazy NPC selection, idempotent creature-sheet controls, item-sheet use, and hidden badges without disabling tracking.

Version 0.2.2 adds first-ever-launch checks for background weapon and armor wear, item-sheet display of the saved state, selected-token priority, assigned-character fallback, no arbitrary actor fallback, refreshing the current context when reopening the macro, following selection only while open, and selection never reopening a closed tracker. Native record-use actions that Foundry cannot observe still require Record Use.

Version 0.3.0 adds 22 tool-role/service-creation tests and 17 service transaction tests. Coverage includes custom physical items, artisan versus special categories, presence versus proficiency, attunement, automatic All-Purpose Tool recognition, no class-only grants, working/empty/broken tools, default service requests, NPC registration/placement failure handling, owned/unowned helpers, combat on either actor, distinct actors with the same tool ID, native check proficiency without permanent mutation, stale helper state, opposite-direction repairs without deadlock, and cross-character rollback.

The 13 added DOM flows cover zero-setup single and batch service requests, custom role controls, helper selection, spending the correct actor's materials/tool use, proficiency grants, tagged internal rolls, role-aware native checks, item-sheet role display, attunement, GM NPC creation/placement, and player service access without NPC-creation permission. All NPC/token operations in these checks use mock Foundry documents. Actual map placement, transient actor preparation and live roll dialogs still need an in-world check.

Version 0.4.0 adds currency tests for copper/silver-first spending, untouched higher coins, minimal change, existing electrum and mixed-purse value preservation. Mending coverage checks native source recognition, physical eligibility, broken versus destroyed states, stacks, campaign/per-item exclusions, completed-cast receipts, one target per cast, observer-versus-owner access, combat, charges/lost-magic preservation and failed-write rollback.

Placed-service tests cover approval-free single and batch payments, buyer versus GM scenes, hidden or removed NPCs, a failed professional check without payment, actor-UUID registration, one queue per token with separate customer histories, concurrent independent instances, synthetic combat isolation and migration of legacy linked repairers. DOM coverage adds the expanded actual-tool editor, native spell/custom-item Mending prompts, direct item drop, independent-token selection, cancellation, duplicate casts, destroyed-item blocking, direct service labels, exact silver payment and batch order history.

Native Mending integration was checked against D&D5e's completed-activity message flags/hook contract; its physical limits were checked against the official spell. Real casting dialogs, observer permissions, document-sheet themes, map-token migration and multiplayer transport still require a licensed running Foundry world check.
