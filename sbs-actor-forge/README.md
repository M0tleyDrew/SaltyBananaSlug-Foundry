# SaltyBananaSlug’s Actor Forge — v1.0.0

A downloadable Foundry VTT module for creating/updating D&D5e actors from workbooks, native actor JSON, world/compendium documents and supplied 5e.tools sources. Made by **SaltyBananaSlug**.

Target: **Foundry VTT 13 / D&D5e 5.x**, test target **5.2.4**. Version **1.0.0** promotes the tested **0.5.0** build with updated version labels and GitHub installation metadata. It retains the same mechanics, artwork and import behavior. The automated suite covers **178 passing tests**; imports, updates/Undo, saved presets/libraries and compendium workflows have also been confirmed in-game. The separate player-account GM-note permission check remains untested in-game; see [TEST_REPORT](TEST_REPORT.md).

## Install and start

In **Foundry Setup → Add-on Modules → Install Module**, paste this manifest URL, install, then enable Actor Forge in your world:

`https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/manifests/sbs-actor-forge.json`

You can also install through **SaltyBananaSlug’s Environment**. For a manual folder installation:

1. Close Foundry. Extract `SaltyBananaSlug_Actor_Forge_v1.0.0.zip`.
2. Replace `FoundryVTT/Data/modules/sbs-actor-forge` with the complete `sbs-actor-forge` folder from the ZIP. Keep assets and vendor.
3. Restart/reload Foundry and enable the module in the world.
4. Open the existing SBS icon macro, **Open Actor Forge** in Settings, or Configure Settings → Module Settings → Actor Forge. A missing GM launcher is created automatically; existing/custom-named launchers are reused. Hotbar placement is manual.
5. Run **Compatibility Check** with your normal modules enabled.
6. Import **Main_Test_v1.0.0.xlsx**, using **Use workbook settings**, both collections set to **World**, and optional source files empty. Follow its Read Me and Test Plan.

The [GitHub install ZIP](https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/packages/sbs-actor-forge-v1.0.0.zip) contains one `sbs-actor-forge` folder. Current and prior workbooks, optional source JSON and the quick start are included. The [blank authoring workbook](workbooks/SaltyBananaSlug_Actor_Forge_Blank_v1.0.0.xlsx) and [illustrated Main workbook](workbooks/SaltyBananaSlug_Actor_Forge_Main_Test_v1.0.0.xlsx) are also available separately.

## Features

**Compendium imports.** Choose World actors or an unlocked, writable Actor world compendium before reading the workbook. Choose World items or an Item world compendium for Catalog grant/cast sources. Preview and final confirmation name both collections. Target lists, folders, Match Actor Key, strict validation, reviewed updates and Undo use those collections. Pack documents are fully loaded; indexes alone are insufficient for updates.

Compendium templates keep native advancement data. Apply pending choices after bringing a template into the World; interactive advancement application is disabled for templates. Group/vehicle actor links require World actors and are rejected for packed templates. Account choices describe actor ownership; pack visibility follows the compendium’s permissions. Packs are created/unlocked through Foundry’s own directory.

**Saved import presets.** Save a row’s settings from Preview, or use Presets to create, edit/rename and delete named defaults. Presets keep folder paths, mode, update categories, advancement setting, account access, collection choices and saved library IDs. Actor names/content/images, update targets and private notes are excluded. Select a preset explicitly in Import; otherwise workbook settings apply. Review account access before import. Deleted accounts are omitted with a note; unavailable preset destinations/libraries require another choice.

**Reusable source libraries.** Sources & Libraries saves currently loaded original files under a name in a GM-only world journal. Libraries are converted again when loaded, so converter fixes apply to stored sources. Choose them in Import, or load/search them in Sources & Libraries after a refresh. Clear Loaded unloads session data and leaves saved libraries intact. Save New, Replace Selected and Delete Selected are distinct actions. Clear the session before switching to conflicting versions. Conflicting same-name/type/source/context records are reported; identical records merge.

**More sheet layouts.** Inline SBS details recognize Biography/Description sections and V2 tabpanels without requiring a tab class. A native biography editor in a Notes panel can identify its host/tab group. Sheet authors can register an adapter with `game.modules.get('sbs-actor-forge').api.registerSheetAdapter({id,match,findHost})`; it returns an unregister function. `findHost` returns `{host,tab,group}`, with host inside the sheet root. Unsupported layouts suggest the native D&D5e sheet. Black text, bounded scrolling, drafts, independent Save and Owner/Observer/Limited access remain. Locked compendium fields are read-only.

## Test files

All files use the `SaltyBananaSlug_Actor_Forge_` prefix.

| File | Use |
|---|---|
| Main_Test_v1.0.0.xlsx | Three fresh TEST050 actors, complete native items/Catalog, 22 live checks; no JSON attachment |
| Update_Test_v1.0.0.xlsx | Match TEST050-COURIER in the selected collection; INT 16 → 17, local edits and immediate Undo |
| Source_Test_v1.0.0.xlsx | Separate Source Pip via a saved source library; no re-upload after saving/reload |
| 5etools_Test_v1.0.0.json | Original custom sources for optional saved-library tests |
| Blank_v1.0.0.xlsx | Empty v2 authoring workbook with instructions |

For Pip: class skills Arcana + Investigation; any background gaming set; either background spell; Charisma for each Signal Slug ability prompt. Tier Eleven/Seventeen are choice-free cantrip targets. All 24 distinct illustrations from v0.4.1 remain; each named item/feature uses its matching image. Artwork has embedded previews.

## Features retained

- Character, NPC, vehicle and group actors; native JSON/template UUIDs; native world exports preserving items, effects, tokens and other-module flags.
- Per-account dropdowns including offline accounts; native portrait Browse / Upload and nested Actor folders.
- Selective merge, replace Forge content or whole replacement; actual diffs and conflict choices; local HP, preparation, charges, configured choices and notes preserved.
- Native species/background/original-class links, proficiencies and explicit Catalog grant/choice advancements.
- Clear cantrip scaling/upcasts, armor/shields, healing consumables with quantity use, fixed charges/recovery/attunement and item spell casts.
- Black scrollable SBS Biography/Description details and separate GM-only notes journals.
- Correct 16-character activity/advancement IDs; exact legacy v0.4.0 activity repair with reference/collision checks. Native validation remains enabled.
- World exports with optional GM notes, actor selections, filename/folder/type filters and oversized-JSON chunking.

## Workbook and update behavior

Schema Version 2 uses Meta, Actors, Fields, Items, Details, Relationships, Advancements, Catalog and JSON sheets. Version 1 remains supported. Read Me, Test Plan and Artwork are reference sheets. Item Image Path overrides its supplied image. Raw JSON/typed paths are optional authoring escape hatches; normal imports and account/note edits use the UI.

Match Actor Key = Yes requires exactly one matching Forge key **in the chosen Actor collection**. Native update IDs also refer to that collection. Modes: merge, managed and replace. Categories affect updates; new actors receive supplied content. Enable Permissions to apply account choices to an existing actor.

GM Notes Action = keep leaves private notes alone when no GM entries are supplied. Supplied entries participate in the update mode. Clear/replace explicitly supplies an empty set. Public-only exports do not clear private notes. Pack notes use qualified Actor UUIDs in protected world journals; moving a pack to another world does not copy those journals.

Catalog sources use immutable supplied versions. Matching sources in the chosen Item collection are reused without overwriting manual edits; changed supplied content gets another document. References use actual native world/compendium UUIDs. Referenced UUID sources must remain available in the destination world.

## Undo and persistence

Only the latest import is recorded, incrementally, in a GM-only Undo journal. Preset/library management leaves that batch intact. Undo restores updates and removes unchanged new documents/empty folders. Edited/incomplete actors and their required sources/linked new actors are retained. Stored destinations are reopened after refresh; missing, locked or unwritable packs stop Undo before mutation and leave the record intact.

Undo checks references in world Actors/Items and Actor/Item compendiums. An unavailable reference pack causes new Catalog sources to be conservatively retained with an explanation. Use one GM import at a time. Multi-document imports are not atomic; an interrupted operation may need inspection. Deleting a saved preset/library leaves imported content intact.

Presets, original sources and Undo snapshots use separate protected world journals. Public workbook/note exports exclude these records. Revision checks catch saved-list changes from another window.

## Conversion and verification boundaries

The converter handles supplied primary arrays for monsters, spells, species/races, backgrounds, classes/subclasses, their features, feats and items. Straightforward mechanics and explicit grant/choice packages are mapped. Filtered/alternative packages, complex conditional rules, shared/variable spell pools, variable item costs, ammunition/mastery and complete class generation need review. Descriptive utility effects do not automate movement, lighting or status changes. No official rules package is included.

`npm ci` installs the DOM test dependency; `npm test` runs document/DOM/fixture suites. Runtime needs no extra install. TEST_REPORT distinguishes mocks and upstream-method checks from live Foundry verification. Runtime Compatibility Check exercises temporary **World** documents and restores the prior Undo record. It does not write user compendiums; use the worksheet for real pack/sheet/scrolling/Midi-QOL checks.
