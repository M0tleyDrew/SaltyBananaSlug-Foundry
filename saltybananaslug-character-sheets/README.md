# SaltyBananaSlug's Character Sheets v0.1.14

A Foundry VTT v13 + D&D5e exporter that turns an Actor into an expanded, printable version of the normal character sheet.

## What it exports

- Branded SaltyBananaSlug printable sheet with character portrait and logo.
- Core character stats, abilities, saves, skills, movement, senses, proficiencies, defenses, resources, spell slots, currency, and biography when available.
- Spell export can be a compact prepared list, prepared spells with full descriptions, a full spellbook with full descriptions, or omitted entirely.
- **Every actual feature/ability item on the Actor with its full description.** Class, subclass, species/race, and background source items are summarized in the character overview instead of exporting their giant progression/sourcebook descriptions.
- **Every inventory item with its full description**, including weapons, armor/equipment, consumables, tools, loot, and containers.
- Conservative top-level reference metadata such as casting time, range, duration, item type, properties, and simple native numeric uses/charges. Foundry activity/action blocks and automation plumbing are intentionally omitted.
- Optional active effects / conditions.

Full descriptions are still preserved for the things the player actually needs to reference: spells, items, and features present on the Actor.

## Player safety

- Players may export only Actors they own.
- Player exports remove Foundry Secret blocks.
- Player exports respect unidentified items and use their unidentified presentation when available.
- GMs can optionally include Secret blocks or reveal unidentified-item truth.

## Output

- **Preview Character Sheet** opens the sheet inside Foundry.
- **Download HTML** uses a character-based filename such as `Bob Benson - Character Sheet.html`.
- **Download PDF** uses the same branded HTML content and styling, but lays it into real A4 page containers before capture. It never slices a continuous screenshot: cards stay whole when practical, long entries break only between description blocks, tables break by rows, and headings stay with following content.
- **Browser Print** remains available only as a fallback and forces a `.pdf` title when invoked from the Foundry preview.

## Launcher

On GM login the module creates a shared macro named **SaltyBananaSlug's Character Sheets**. Players with access to the macro can launch it, but the module still enforces Actor ownership.

Runtime API:

```js
game.modules.get("saltybananaslug-character-sheets")?.api?.open();
game.sbsCharacterSheets.open();
```

You may optionally pass an Actor, Actor ID, or selected-token Actor ID to `open()`.

## Target

- Foundry VTT v13
- D&D5e 5.x


## v0.1.14 — Semantic PDF pages
- Replaced screenshot-cropping pagination entirely. PDF pages are constructed as actual A4-sized DOM pages before capture.
- The normal downloadable/preview HTML remains continuous, branded, and linked.
- Section and spell/item group headings are kept with the first content beneath them.
- Normal cards stay whole when they fit; large cards split only at description paragraphs/list/table blocks.
- Tables split by whole rows and lists split by whole items when necessary.
- The paginator may split a large entry earlier to use substantial remaining page space, reducing accidental half-empty pages.
- No arbitrary Y-coordinate crops are used, so PDF generation should not bisect words or rendered text lines.


## v0.1.8 — Direct PDF download
- Replaced the primary print-to-PDF workflow with a real prebuilt `application/pdf` Blob and a normal **Download PDF** link.
- PDF filenames explicitly end in `.pdf` and use the Actor name (`Character Name - Character Sheet.pdf` or `Character Name - Spellbook.pdf`).
- The direct PDF is a text-first reference layout with SBS branding, page numbers, stats/tables, features, items, spells, and full descriptions.
- **Browser Print** remains available only as a fallback.
- HTML remains the richest styled export with portrait/logo imagery and the original expanded-sheet styling.

## v0.1.5 — Firefox / popup-blocker fix
- Preview no longer uses `window.open()`.
- Download no longer fires a delayed programmatic Blob click.
- Sheets build into a resizable preview window inside Foundry.
- The preview provides real user-clicked **Download PDF** and **Download HTML** links. The PDF Blob is created before the preview is shown, so Firefox receives a normal file download rather than an asynchronous print/download trick.
- The direct PDF uses a conservative text-first layout for reliability and readability. The HTML export remains the fully styled version with portraits, SBS logo art, and rich description formatting.


## v0.1.5 — Expanded-sheet cleanup
- Removed full class, subclass, background, race, and species source-item descriptions from the detailed reference section.
- Detailed Features now contains only actual `feat` items on the Actor.
- Structural class/species/background information remains in the overview.
- Inventory excludes those structural build items.
- Removed raw embedded-effect change listings and JSON-ish prerequisite output from item cards.
- Source fields and active-effect tables are now off by default to keep the sheet cleaner.
- Removed forced page breaks between reference sections for a denser, normal-character-sheet flow.
- HTML download filename and print/PDF title are explicitly based on the character name rather than the Foundry scene.


## v0.1.5
- Spellbook export mode: Full Spellbook, Prepared/Always-Available Only, or None.
- Strips MIDI-QOL/DAE/ItemMacro automation UI/configuration from exported descriptions.
- Deduplicates repeated activity blocks and suppresses activity metadata already shown on the main item/spell card.
- Suppresses duplicate activity descriptions when they match the item's main description.
- Prepared spell mode is intentionally compact (names grouped by level, no spell descriptions); full descriptions remain available through Full Spellbook mode.
- Foundry-only activity prompt/automation condition text is not exported.


## v0.1.5
- Added **Prepared spells only — full descriptions** mode.
- Added **Spellbook only** export mode for players who want a standalone spell reference.
- Activity descriptions/configuration are no longer exported. Only whitelisted D&D5e player mechanics are shown.
- MIDI-QOL / DAE / ItemMacro / Times Up style automation text is filtered from activity labels and values.
- Standalone spellbook downloads/prints use `Character Name - Spellbook` filenames.


## v0.1.5 cleanup
- Removed exported Action Details / activity blocks entirely.
- Uses/charges are shown only when they are simple numeric native counters; formula/macro/automation values are omitted.
- Spell, feature, and item full descriptions remain intact.


## v0.1.8 save fix

- PDF and HTML buttons no longer expose or navigate to `blob:` object URLs.
- Downloads use Foundry v13's native `foundry.utils.saveDataToFile` helper from the user's button click.
- The direct PDF remains a real PDF generated by the module; Browser Print remains fallback only.


## v0.1.8 styled PDF export

- PDF export now uses the rendered HTML preview as its visual source of truth.
- Preserves the SaltyBananaSlug branding, portrait, card styling, spacing, tables, and typography from the preview.
- Uses A4 page captures with smart break points. Normal-sized spell/item/feature cards move to the next page when possible, leaving whitespace rather than cutting the card apart.
- Very long descriptions can continue across pages at paragraph/list/table-row boundaries.
- The final PDF remains saved through Foundry's native `saveDataToFile` path; the module does not create a downloadable Blob URL.


## v0.1.12 PDF pagination fix
- Reverted the v0.1.10 hidden-layout-clone experiment.
- PDF export now renders the good continuous HTML sheet once, then crops that exact rendered image at the existing safe page boundaries.
- Keeps the v0.1.9 visual layout and branding unchanged while eliminating per-page HTML reflow.
- Uses exact preview width and outward-rounded crop edges to avoid slicing antialiased text.


## v0.1.14
- Adds a reserved footer to every generated PDF page after semantic pagination is complete.
- Footer includes the SaltyBananaSlug logo/brand, character name, and `Page X of Y`.
- Footer space is reserved during pagination so branding never overlaps or changes content ordering.
