# Actor Forge v1.0.0 — verification report

**178 automated tests passed; zero failures, skips or cancellations.** Version 1.0.0 promotes the exact tested 0.5.0 runtime with its build label updated and GitHub distribution metadata added. All remaining runtime scripts, CSS, bundled SheetJS and artwork are unchanged. Workbook/version labels and release documentation are updated.

**Live verification:** imports (including batches), update/Undo, saved presets after reload, saved source libraries and compendium import/update/Undo were confirmed working on the 0.5.0 baseline. The separate player-account GM-note permission check remains **untested in-game**. Its automated privacy/permission tests pass; this report does not claim a live multi-account check. No live Foundry world is available in the build environment.

The 0.5.0 baseline also recorded nine passing upstream-method checks with small runtime shims; their saved output is retained. These checks are historical evidence and were not rerun for the version-only promotion.

## New coverage

- Writable pack choices by type, package, lock and GM ownership; missing/locked destinations fail before writes.
- Full pack hydration, folders, native UUIDs, schema constructor pack context and Catalog references.
- Actual Main workbook and real Import/Preview callbacks create Actor/Item pack documents without changing World actor counts.
- Cache eviction/reload, colliding World IDs, pack-specific Match Actor Key, reviewed concurrent edits and exact update restoration.
- Locked Undo preserves the batch; unlocking resumes. Edited templates retain sources/folders/private notes.
- References from world/other-pack documents, source dependency protection and conservative source retention for unavailable packs.
- Qualified packed-Actor private-note keys prevent same-ID collisions across packs.
- Packed live group/vehicle links rejected; template advancements deferred.
- Protected presets/libraries, revision checks, unique names, rename/delete, stale saves and missing/invalid defaults/libraries.
- Profile content exclusions, current accounts/deleted-account handling, content categories and existing/new folder paths.
- Original sources converted after session clear/reload; conflicting identities fail and identical records merge.
- Real saved-library save/clear/load and preset manager/Import/Preview events.
- V2 tabpanels, semantic Notes hosts, custom group activation/adapters, unsupported layouts and locked read-only fields.
- Actual Main/Update/Source v1.0.0 fixtures, 22 manual cases, fresh keys, three portraits, 20 converted records and all art.

All previous ID, mechanics, privacy, updates, drafts, folders, portraits, exports, conversion and relationships regressions remain. Runtime validation calls installed CONFIG document classes with strict validation; it is not disabled for Midi-QOL.

## Artifact audit

All 24 WebP assets decode and match manifest dimensions/bytes/SHA-256, with distinct hashes. Main/Update/Source each include 24 distinct embedded previews; Blank has none. All image paths resolve. Activity/advancement IDs are 16-character alphanumeric values. Authors/credits are SaltyBananaSlug; new workbook/module versions are 1.0.0.

The ZIP audit reads its own asset bytes and checks hashes. The package has one top-level sbs-actor-forge directory, no nested kit ZIP and no node_modules. Runtime includes bundled SheetJS and needs no additional install. The repository's existing Environment catalog workflow generates the published manifest and install ZIP from the committed module folder.

## Primary API and upstream evidence

Implementation was checked against official Foundry v13 [CompendiumCollection](https://foundryvtt.com/api/v13/classes/foundry.documents.collections.CompendiumCollection.html), [Document pack context](https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html) and [Folder](https://foundryvtt.com/api/v13/classes/foundry.documents.Folder.html) documentation. It uses native getDocuments/getUuid, pack-context creation and native restore/delete.

Nine method checks execute inspected official D&D5e code at revision 7cc004e7c1d99ed37c83fec81e28c48f17e28b07 for the 5.2.4 target: cantrip tiers, limited-use cantrips, upcasts, innate rest pools, class casting, Forward activities, original/multiclass restrictions, Trait paths and potion/wand consumption. No upstream game-content files are distributed.

This is method-level evidence, not a full native document/plugin runtime. Pack tests use independent in-memory backends; Linkedom tests do not measure browser layout. Actual pack folder creation/restore, native advancement dialogs after World import, alternate-sheet appearance, scrolling, uploads and Midi-QOL require the worksheet checks.

## In-game sequence

Main has 22 cases; Update and Source each have four focused cases. Run Compatibility Check, then Main in the World without JSON. Test preset save/reload/account choices; update/Undo; pack create/locked Undo; pack update/Undo; source save/reload; alternate sheets and account privacy.

Runtime Compatibility Check writes temporary World documents and restores the previous Undo record; actual pack writes are covered by the worksheet. Only the latest import is undoable. Undo of Update leaves original Main actors/templates. Private pack notes remain in this world’s protected journals. Keep source compendiums available for grants/casts.
