# Actor Forge v1.0.0 test guide

## Start here

Replace the installed sbs-actor-forge module folder with the folder in the v1.0.0 module ZIP, then reload Foundry. Use the existing SBS icon macro or Open Actor Forge in Settings. Run Compatibility Check first.

## Main test

Import this Main workbook with Use workbook settings and both collections set to World. Main is self-contained: leave optional source files empty. It creates three TEST050 actors with distinct art.

## Native choices

Pip: choose Arcana and Investigation; any background gaming set; Depot Seal or Parcel Ward; Charisma for each Signal Slug spell-ability prompt. Tier Eleven and Tier Seventeen need no choices. Check species, background and granted features.

## New features

Named import presets; source libraries saved across reloads; Actor and Item compendium destinations; pack-aware updates and Undo; more native Biography/Description layouts plus an adapter API for custom sheets.

## Presets

In Preview, set the folder, account access, update mode and content categories, then click Save these settings as preset on Pip. Give it a name. Cancel the import afterward if you are only testing the preset. Choose the name in Import to reuse it. Presets manages new, edit/rename and delete.

## Compendiums

Create two empty World compendiums through the native Compendium directory: SBS 050 Actors (Actor type), SBS 050 Grants (Item type). Unlock both. Select them under Actor collection and Grant source collection when importing Main. Main has no group or vehicle actor links.

## Template choices

Compendium imports keep class/species/background items and their advancement data. Apply advancements is disabled for templates. Open the template, or bring it into the World and apply its pending choices there. Party and crew links belong to World actors.

## Undo order

Undo affects only the latest import batch. For the pack-create and lock cases, Undo Main before importing another workbook. Update then Undo checks restoration of the update; the original Main actors/templates remain.

## Update workbook

Main must exist in the selected collection first. Import SaltyBananaSlug_Actor_Forge_Update_Test_v1.0.0.xlsx with Use workbook settings and the same Actor/Grant source collections. It finds TEST050-COURIER in that collection; INT changes 16 to 17. Use default Keep current choices to preserve local edits. Undo immediately.

## Source libraries

Optional test: clear loaded sources, upload the matching 5etools_Test_v1.0.0.json through Sources & Libraries, enter SBS 050 Library and click Save New Library. Reload Foundry. Import Source_Test_v1.0.0.xlsx and select this saved library; no JSON re-upload is needed.

## Optional files

Update, Source, matching source JSON and Blank workbooks are also in the module ZIP’s workbooks folder. The JSON is a source-content file only; Main already contains all native items and Catalog grants.

## GM privacy

Public SBS fields stay on Biography/Description. GM notes, preset records, source libraries and Undo snapshots use protected GM-only world journals. A compendium template’s private notes stay in the current world and are not bundled into the pack.

## Sheet layouts

Use the native D&D5e sheet first. If another installed sheet has a native biography editor or Biography/Description content panel, verify the same inline, black, scrollable fields there. Unsupported layouts show a native-sheet suggestion from Biography; no extra notes window is created.

## Artwork

Every distinct named spell, item and origin has its own bundled image. These matching illustrations carry forward from the working v0.4.1 release. The Artwork sheet has all 24 previews. Shared named items reuse their matching image.

## Testing

Version 1.0.0 promotes the tested 0.5.0 build. Import, update/Undo, preset reload, saved source libraries and compendium workflows were confirmed in-game. The separate player-account GM-note permission check has automated coverage but remains untested in-game. Test Plan results are blank so the workbooks remain reusable for your own checks. Use one GM import at a time.

## Credits

Original custom fixture content and module by SaltyBananaSlug. Foundry VTT 13 / D&D5e 5.x; target 5.2.4.

## Test sequence

1. **1 · Install and launcher** — Reload after replacing the module. Open Actor Forge using the existing branded macro and Settings button. Expected: Version 1.0.0 is shown; Import, Sources & Libraries, Presets, Export, Biography, Undo and Compatibility Check are available. No duplicate launcher macro.
2. **1 · Compatibility** — Run Compatibility Check in a test world. Expected: The native schema, item, origin, relationship, GM-note and import/Undo probes finish without failures; temporary probe documents are removed.
3. **1 · Main world import** — Import Main with both collections set to World. Complete Pip’s native choices. Expected: Three TEST050 actors appear in SBS Forge Test 050 folders. Pip has linked species/background/class, native grants, scaling spells, armor, potions and wand. No source JSON is required.
4. **1 · Artwork and readable notes** — Open Pip and both tier actors. Inspect spells, items and features. Open Biography and scroll the SBS area. Expected: Distinct portraits and matching images for each named item. Black text on white remains readable; native Biography and long SBS values remain reachable.
5. **2 · Save preview preset** — Preview Main, set a new folder path, choose a player account’s access and disable a content category. Save these settings as preset named SBS 050 Preview. Cancel Preview. Expected: Preset save writes no actors. The name appears in Import and Presets; actor names, portraits, targets and GM notes are not part of the preset.
6. **2 · Reload preset** — Reload Foundry, select SBS 050 Preview in Import, choose Main and inspect Preview. Cancel. Expected: Folder path, mode, update categories, account choices and collections are restored. Current player accounts appear by name, including offline accounts.
7. **2 · Edit, rename and delete preset** — Open Presets; edit SBS 050 Preview, rename it and change one setting. Reopen Import to verify, then delete that disposable preset. Expected: One renamed preset remains after edit; revised defaults appear on selection. Delete removes the preset without touching actors.
8. **3 · World update** — Set Pip HP to 7, spend four wand charges, keep it attuned and edit an SBS public note. Import Update with World destinations and default Keep current choices. Expected: INT becomes 17. Local HP, charges, attunement and SBS text remain. Native configured choices remain; no repeated grant dialogs.
9. **3 · World update Undo** — Undo immediately after Update. Expected: Pip returns to the exact pre-update state, including local edits and INT 16. The original Main actors remain.
10. **4 · Pack destination choices** — Create and unlock empty SBS 050 Actors and SBS 050 Grants world compendiums. Preview Main with these destinations. Expected: Only writable world packs of the correct type are offered. Preview names both collections. World actors are not update targets in a pack preview.
11. **4 · Template import** — Confirm Main into the two empty packs. Inspect the templates, their folders, origins and Wand Cast / advancement source references. Expected: Three Actor templates and required Item grant sources are stored in the chosen packs. World actor count stays the same. Native references use the Item compendium. Advancement choices are retained without dialogs.
12. **4 · Packed GM notes** — Open packed Pip’s Biography as GM; inspect public details and private note, then inspect actor data / export if desired. Expected: Private note appears only to GMs through a protected journal in this world. The secret text is absent from raw actor flags. Same-ID world actors use separate private note records.
13. **4 · Locked Undo** — Before another import, lock SBS 050 Actors and run Undo. Unlock it and run Undo again. Expected: Locked Undo reports the destination problem without removing anything or replacing the batch. After unlocking, unedited templates, unused sources and newly created folders from that Main batch are removed.
14. **5 · Pack update** — Import Main into the packs again. Edit packed Pip’s HP to 7. Import Update with the same Actor and Grant source packs. Expected: Only the packed TEST050-COURIER is matched. INT becomes 17; local HP stays 7. World Pip keeps its current values.
15. **5 · Pack update Undo** — Undo immediately after the pack Update. Expected: Packed Pip is restored to pre-update INT 16 and HP 7. Original packed Main templates remain. World actors are unaffected.
16. **6 · Save a source library** — Open Sources & Libraries and Clear Loaded. Reopen, upload matching 5etools_Test_v1.0.0.json, name it SBS 050 Library and Save New Library. Expected: A saved library with 20 records appears. No actors are created by saving the library. Source files are kept in a GM-only journal.
17. **6 · Reload source library** — Reload Foundry. Import Source_Test_v1.0.0.xlsx, check SBS 050 Library under Saved source libraries and leave optional file upload empty. Expected: Source Pip resolves all eleven initial item rows through the saved library. Matching native class/species/background, grants, spells and equipment appear after choices.
18. **6 · Browse saved library** — Open Sources & Libraries, select SBS 050 Library and Load & Choose. Search for Signal Slug, Courier Spark and Dispatch Wand. Cancel. Expected: Saved original source records convert correctly after reload and can be searched and selected. Their conversion notes remain visible.
19. **6 · Conflicting sources** — As an optional disposable check, make a copy of source JSON with one named record changed but the same source/name. Load both versions together. Expected: Conflicting identities are reported instead of silently replacing data. Clear Loaded and select the intended library to continue. Saved library records remain unchanged.
20. **7 · Alternative sheet** — If you already have another actor-sheet module installed, select its sheet for Pip and inspect Biography or Notes. Use the Actor Forge Biography action. Expected: Supported semantic biography layouts get one inline SBS panel, with the correct native tab activated. Drafts survive rerender; fields remain black and scrollable. Record the installed sheet name/version and result.
21. **7 · Account privacy** — View Pip using an Owner, Observer and Limited account if available. Expected: Owner edits only public SBS details; Observer reads them; Limited gets no SBS panel. None of these accounts can read GM notes, source-library journals, presets or Undo snapshots.
22. **7 · Preserved mechanics** — Use Courier Spark on levels 5/11/17, drink Courier Broth and cast via an attuned Dispatch Wand. Expected: Cantrip damage is 2d6/3d6/4d6. Broth heals 2d4 + 2 and consumes quantity. Wand consumes two charges for Dispatch Burst. This retains the working v0.4.1 mechanics.
