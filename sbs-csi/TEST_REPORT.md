# SBS CSI 0.1.7 validation

- 38 Node checks pass.
- Chromium hotbar regression: simulate native reserved --offset when chat floats; hotbar center is identical across Chat, Actors and Settings when floating input is hidden. Verify for GM local preference and forced player Hide policy at UI scales .5, .75, .9, 1 and 1.25.
- Player Show policy removes the override and restores the native offset to avoid visible input overlap. Macro button click still executes. No hotbar position, transform, sizing, document or event handler is replaced.
- Existing scaled-sidebar, activation, chat policy, draft preservation, notifications/popout chat, launcher permissions and keyed example-import browser checks pass.
- Workbook files are byte-identical to v0.1.6. No scene reimport needed.
- Browser tests use actual module CSS/scripts with a simulated Foundry DOM/API. Live user-world validation remains with the user.

# SBS CSI 0.1.6 validation

- 38 Node tests pass, including screen/layout height conversion, player-policy precedence and existing importer/permissions checks.
- Chromium harness reproduces the supplied 1280×698, .75 transform report: a 690 CSS-pixel panel renders at 517.5 screen pixels before the fix, then reaches the target bottom at 690 screen pixels (920 CSS pixels). Scales .5, .75, .9, 1 and 1.25 and viewport resize pass. Shared #ui-right inline height/class remain unchanged.
- Existing activation, delayed overrides, scrolling/search, player launch permissions, copyable report and keyed two-scene example import checks pass. Layout observers settle. Original local wrapper styles/priorities restore on deactivation.
- Chat tests cover GM local preference, forced player Hide/Show overriding the opposite local preference, personal mode, other tabs including Actors and Settings, public input-reparent hook, drafts, visible roll notifications and intentionally opened chat-popout input.
- Shipped workbook files are byte-identical to v0.1.5; no scene reimport is required.
- Tests execute actual module scripts/CSS in Chromium with simulated Foundry API/DOM, including the supplied transform dimensions. A live user-world and actual networked GM/player session are not available; these are not claimed as tested.

# SBS CSI 0.1.5 validation

- 32 Node checks pass. Importer logic and all shipped workbook bytes are unchanged from 0.1.4.
- Chromium activation regression: hidden first render, standalone sidebar-content beside sidebar navigation, late important height/max-height overrides, post-render height reset and viewport resize. Panel reaches the viewport bottom inset in the harness.
- Layout observers settle rather than writing once per animation frame. Deactivation restores original inline heights and priorities.
- Ruler action opens selectable JSON diagnostics, including actual ancestor bounds and computed styles.
- Existing scroll/search, player launcher visibility and two-scene example import checks pass.
- Live user-world layout has not been inspected. The diagnostic report supplies its actual structure and computed dimensions if another conflict remains.

# SBS CSI 0.1.4 validation

- 32 Node tests pass. New tests cover blocked openings, source-to-scene coordinate scaling, token-center reprojection, preserved token data and failed-import rollback after a scale change.
- Browser harness now reproduces Foundry's `.application.sidebar-tab` root, a 750 px outer wrapper, 200 px inner wrapper, and a post-render height reset. Dock fills to 8 px above viewport bottom, resizes, scrolls/searches, and restores wrappers when deactivated.
- Existing v0.1.3 travel imports updated with all three revised workbooks: 30 scenes, 979 managed segments, 5 optional hidden lights and 2 key Items. No missing artwork or duplicate scenes. Placed test token retains its image-relative center after grid correction.
- Four enabled public player launchers execute in player mode; CSI import and Actor Forge GM launchers are absent.
- All twenty revised source-art wall/grid/token overlays visually reviewed. Source building crops checked separately for door jambs; the generic windmill arc was replaced with traced masonry. Automatic opening-intersection checks pass.
- Battle source spacing is 34–50 px per 5 ft, with uniform enlargement where needed for Foundry's 50 px grid minimum. Scenic images have no grid or token vision.
- Review images are separate from full-resolution Artwork images, and only Artwork images feed scene backgrounds.
- This harness simulates Foundry APIs. Actual user-world CSS, native rendering, multiplayer roles and Lock & Key interaction still need a live world check. No claim of live validation is made.

# SBS CSI 0.1.3 validation

- 29 Node tests pass, including battle grid defaults/explicit hidden grids, scenic behavior, player-safe launchers, import safety, key links, resolver and worksheet schema.
- Chromium document/UI harness: sidebar reaches outer sidebar bottom despite a short content parent; viewport resize, scroll and search pass. Four player launchers appear and execute; CSI/Actor Forge GM launchers are hidden.
- Three previous ten-scene workbooks imported, followed by all three revised workbooks. Updates preserve scene identity and placed token; no duplicate scenes/keys or missing images. Result: 30 travel scenes, 984 managed segments, 5 optional hidden lights, 2 linked key Items.
- All twenty battle maps use square grids at 5 ft, 60/64/72 source px per square, visible alpha .35. All ten scenic views have grid disabled.
- Visual review: all twenty full-size image/geometry overlays reviewed, with specific corrections recorded in Scene Notes. This is manual interpretation of artwork, not automatic image recognition.
- The harness simulates Foundry document APIs. Live Foundry v13 rendering and Lock & Key interactions still require a world test; they are not represented as validated by this harness.

## Previous validation

# SBS CSI 0.1.2 validation

## One-worksheet checks (0.1.2)

Passed in Chromium using the actual module file-loading and preview code with a Foundry-shaped document harness:

- One XLSX selected, with no ZIP or loose artwork files: all 30 original images extracted at their full 1448×1086 / 1672×941 dimensions.
- All 30 scenes imported: 878 wall/opening segments, five light sources and two matching key Items.
- Self-contained example worksheet imports; calibration download reloads with both original artwork files intact.
- Independent OOXML inspection confirms the completed travel workbook contains all 30 supplied original PNG files byte-for-byte on Artwork. Scale Guide thumbnails are not used as scene backgrounds.
- Independent CRC check passes. Calibration round-trip preserves both example media files byte-for-byte.
- Existing 27 unit tests pass.

## Previous regression checks

`node --test tests/*.test.js`: 27 tests passed.

Coverage includes blueprint scale/padding, scenic defaults, walls/windows/doors, multi-door keys, repeat imports, manual-edit protection, rollback, batch continuation, filename resolution, current blank XLSX parsing, hub permissions/discovery and ordering.

Real Chromium browser integration (`CSI_EXTENDED_TESTS=1`): passed.

- Actual module JavaScript, Handlebars template, CSS, bundled SheetJS and JSZip run in Chromium with a Foundry-shaped document/UI harness.
- 47 enabled test modules: launcher list overflows and scrolls; search filters module/tool names; CSI starts first; standard slug icon displays; versions are hidden by default.
- Alphabetical and custom Up/Down ordering save and apply.
- Hub launches Actor Forge and the CSI importer.
- Example ZIP parsing, map preview, scenic settings, calibration and two-scene import complete.
- Standalone travel XLSX without images gives explicit full-ZIP/artwork guidance in a selectable report; Copy button works or selects the text for manual copy.
- Actual rebuilt Marl travel ZIP: all 30 original images decode, 30 scenes are ready, and all 30 import in the document harness. Verified 878 wall/opening segments and two linked world key Items.
- A partial package with the travel workbook plus one map shows one valid scene and 29 excluded scenes; the valid scene imports and all exclusions are reported.
- No uncaught browser script errors in these checks.

The saved travel workbook was independently parsed and compiled against all original image dimensions. All battle maps have explicit 5 ft grid settings (60, 64 or 72 px); all ten scenic scenes have no grid/vision/padding. Five optional fire lights start hidden. No compiler warnings.

The scene archive was rebuilt after the earlier saved copy was found truncated. Its ZIP CRC check passes, its embedded workbook matches the standalone workbook, and all 30 artwork files match the source images byte-for-byte.

## Live-world limit

The browser tests simulate Foundry's document APIs. They verify the actual file-loading, preview, hub and batch-control code, but do not replace a live Foundry v13/D&D5e world check. Native data-model validation, uploads, rendered scene geometry and player use of Lock & Key still need the first in-world confirmation.
