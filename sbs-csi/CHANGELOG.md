# 0.1.7

- Clear Foundry's reserved horizontal hotbar offset while the floating chat input is hidden. The hotbar stays in its normal centered position when switching between Chat and another sidebar tab.
- Follow the existing effective chat-visibility policy for GM/player clients; restore native offset automatically whenever floating chat is shown.
- Preserve native hotbar positioning/scale, responsive layouts and macro controls. No new setting, hotbar document changes or scene reimport needed.

# 0.1.6

- Correct sidebar height for inherited Foundry UI scaling. Reproduced the reported 1280×698 viewport, 690 CSS px and 517.5 screen px at transform scale .75; convert available screen height to local CSS height before applying it.
- Stop resizing the shared #ui-right container so SBS sizing does not reposition floating chat or other right-side UI.
- Add personal floating-chat visibility setting and GM-controlled world policy for players: Hide outside Chat, Show (Foundry default), or Let each player choose. Hide is the default.
- Hide only the input/controls under chat notifications; preserve input in Chat and intentional chat popouts, drafts and roll notifications. Follow the public renderChatInput and sidebar hooks.
- Extend layout diagnostics with the measured rendered vertical scale.
- No workbook/map setup changes or scene reimport required.

# 0.1.5

- Sidebar-only layout correction: refit after activation, hidden-to-visible transitions, late style/class changes and viewport changes.
- Follow the actual ancestor chain, including standalone sidebar-content containers and internal frame wrappers, instead of requiring ancestry inside #sidebar.
- Apply bounded height limits with inline priority while active; restore original wrapper styles and priorities on deactivation. Avoid observer feedback loops with idempotent writes.
- Added ruler button with copyable layout diagnostics for world-specific themes.
- Importer behavior, map calibration and worksheet contents unchanged; no scene reimport needed.

# 0.1.4

- Fixed the real V2 sidebar class case: the tab itself is `.application`, and was being mistaken for its own height-limiting parent. Dock height now follows the viewport; short ancestor wrappers stretch only while SBS is active and are restored on deactivation/close. Position/post-render updates reapply the fit.
- Rebuilt travel scale using source-image clearances, including the narrow footbridge and door jamb widths. Added visual Scale Review sheets with 5 ft/10 ft token examples and stated reference measurements. Artwork has no absolute ruler; calibration choices are documented.
- Original-image door review corrected windmill masonry and its painted lower-right entrance; corrected farmhouse bedroom and waystation front-door jambs.
- Added validation rejecting solid segments crossing door/window openings.
- Uniform scene/grid rescaling retains tokens and reprojects their centers to the same image positions; rollback restores prior token positions if import fails. Other manual geometry remains protected.
- Sidebar player behavior verified: visible tab, player-facing allowlisted tools/public registrations/permitted macros; GM manager APIs remain hidden.

# 0.1.3

- Sidebar fills the outer sidebar height even when the tab parent is content-sized; retains internal scrolling and reacts to resize.
- Battle maps now default to a visible white Foundry square grid at 35% opacity. Explicit FALSE still hides it; scenic views remain gridless.
- Direct player launchers for enabled Party Viewer, Quest Board, Message Cantrip and Card Games; management launchers remain GM-only.
- Blank worksheet field guidance reflects visible battle grids.
- Travel worksheets remain three self-contained files of ten scenes each. All twenty battle maps visually rechecked at native image dimensions. Misplaced walls, phantom rock polygons, path-crossing barriers, fence/ledge outlines, side rooms and windmill entrance corrected. Existing scene IDs and token scale preserved.
- Regression checks cover full-height sidebar in a short parent, resizing, player launch permissions and update of prior travel imports in place.

# 0.1.2

- Completed XLSX worksheets now carry original scene and key artwork on Artwork; one worksheet selection supplies the full import.
- Resolves OOXML drawing relationships and row anchors using the same approach as SBS Actor Forge.
- Ignores review-thumbnail drawings on other sheets, preserving full map resolution.
- Raises the workbook size allowance for embedded image batches while retaining per-image limits.
- Calibration downloads preserve embedded original image bytes and drawings by patching only Scenes XML.
- Blank and example downloads are self-contained XLSX templates with Artwork.
- Verified all 30 embedded PNG files byte-for-byte against the supplied originals, then imported all 30 scenes from only that worksheet in Chromium.

# 0.1.1

- Standard SBS slug icon and compact shared tools header.
- Explicit CSI import and blank-template launchers, always available to GMs in the hub.
- Bounded sidebar height, scrolling launcher list and delegated search/click handlers.
- Default CSI-first sorting plus alphabetical and editable custom ordering.
- Module version labels hidden by default; optional setting labels them clearly.
- Separate artwork-file and artwork-folder inputs for standalone workbooks.
- Clear worksheet-only guidance and unique folder/case/browser-suffix image matching.
- Per-scene missing-image/setup errors are excluded in preview; valid scenes remain importable.
- Per-scene validation and successfully rolled-back failures no longer stop unrelated scenes.
- Selectable import report with Copy and Download buttons.
- Browser regression checks for hub scrolling/search/order and the actual 30-scene travel ZIP.

Schema remains version 1; existing CSI worksheets remain compatible.
