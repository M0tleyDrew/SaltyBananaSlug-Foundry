# SaltyBananaSlug's Complete Scene Importer — SBS CSI

Version 0.1.7. For Foundry VTT v13 stable and D&D5e 5.x. Requires **Lock & Key** (module ID `LocknKey`).

## Install

Install through **SaltyBananaSlug's Environment**, or paste this URL into Foundry Setup → Add-on Modules → Install Module → Manifest URL:

`https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/manifests/sbs-csi.json`

For manual ZIP installation:

1. Close Foundry. Extract the ZIP so the folder is `Data/modules/sbs-csi/` and `module.json` is directly inside it. Do not nest a second `sbs-csi` folder.
2. Restart Foundry and enable **Lock & Key**, then **SaltyBananaSlug's Complete Scene Importer** in Manage Modules.
3. Open the **slug icon in the right sidebar**. It contains CSI, other enabled SBS tools, and macro shortcuts. CSI also creates a GM launcher macro and has an entry in Module Settings.

The GitHub catalog automatically publishes a Foundry-ready manifest and installation ZIP for this version.

## One tab for SBS tools

The slug tab is built into CSI and uses the standard SBS slug icon. The surveyor mascot belongs to the importer itself. It discovers enabled `sbs-*`, `saltybananaslug*`, and Party Viewer modules. It uses their exposed launchers, registered settings menus, and associated executable macros. Older modules are supported without editing their files. Party Viewer, the item uploader, merchants, containers, lore and factions have adapters for their older global APIs. Modules with no available launcher are listed as such for GMs.

Use **Choose macro shortcuts** to include any existing macro, including standalone artificer tools. SBS-branded macro names also appear automatically. Shortcuts are saved per user. Search filters module titles, tool names and macro names. The list scrolls within the sidebar, with CSI first by default. Arrange tools offers alphabetical and custom Up/Down ordering; the same sort mode is available in Module Settings. Version labels are hidden by default and can be enabled in Module Settings. Refresh rescans launchers. Management APIs are shown only to GMs; players see Party Viewer, the Quest Board, Message Cantrip, Card Games, explicitly public registered tools, and executable macros when installed/available. Existing module permissions still apply. NPC Memories requires a selected NPC token.

## Import prepared scenes with one worksheet

1. Open **Import scenes** in the slug tab.
2. Select the completed **XLSX worksheet**. It contains the original artwork on its Artwork tab as well as scene setup data.
3. Choose **Validate & Preview**, inspect/select scenes, then **Import Selected Scenes**.

No separate scene ZIP or loose artwork selection is required. A completed workbook can contain maps and scenic illustrations together. The importer extracts the original embedded image bytes, uploads them to Foundry and applies scale, walls, windows, doors, lights, locks and key Items.

**Download Blank Worksheet** includes the Artwork sheet and instructions. Put each logical filename in Image Path, matching Scenes.image or Keys.image, and insert its original picture on the SAME row. Artwork pictures can display smaller in the workbook while retaining their original bytes. Use full-resolution PNG/JPEG artwork; avoid spreadsheet-app picture compression when editing. The original map images on Artwork are separate from the annotated review thumbnails on Scale Guide.

**Download Example Worksheet** provides a self-contained two-scene example with its map and mascot images embedded. Legacy ZIP/external-image imports remain optional under the collapsed legacy section.

The module applies the prepared blueprint; it does not infer geometry or lighting from a bare image. Existing artwork needs no Foundry scene export first.

## Maps and scenic illustrations

- `battle`: square-grid token scale, default 25% Foundry staging padding, token vision and fog exploration on. Foundry grid lines visible by default (white, 35% opacity). The source artwork remains gridless. Set show_grid to FALSE to hide the overlay. Global illumination defaults on; set it off and add lights for a dark interior.
- `scenic`: the complete illustration, zero padding, no visible grid, no token vision, fog exploration off and global illumination on by default. Leave interaction rows empty.
- `custom`: individually configure interactive artwork using the map defaults.

Coordinates are **original-image pixels from the top-left**, before padding. Lights' bright/dim radii are **scene units**, not pixels. CSI applies scaling and Foundry's computed padding offset to walls and lights together.

For scale, enter `grid_columns` (squares across the full image width) or `grid_size` (original-image pixels per square). Columns take priority. Without either, maps use 100 pixels/square and show a warning. Low-resolution artwork is enlarged as needed to meet Foundry's 50-pixel minimum grid; it does not gain image detail.

You can also click two points on the preview and enter their known separation in scene units. Apply measurement, then **Download worksheet with these calibrations** to reuse the result. Calibration downloads patch the Scenes XML inside the original workbook and preserve embedded original artwork, other worksheets and drawing relationships.

## Doors, windows and real keys

Kinds: `wall`, `door`, `secret`, `window`, `terrain`, `invisible`. Doors may start `closed`, `open` or `locked`. Windows block movement and pass sight/light by default. `window_range` adds distance-limited window vision. Individual sight/light/sound/movement restrictions can be overridden.

Each Keys row creates a D&D5e loot Item in **Items → Map Name → Keys**. `doors` lists door wall IDs separated by semicolons. One key may open many doors; several keys may open the same door, including master keys. Key descriptions are plain text. Optional key artwork uploads with the package. `consume` uses Lock & Key's remove-on-use flag.

CSI uses Lock & Key's case-sensitive `LocknKey` scope, `IDKeysFlag`, `LockDCFlag`, `LockBreakDCFlag` and `RemoveKeyonUseFlag`. Stable link IDs keep keys usable after a reimport, including copies already given to actors. Every imported key/door relationship is checked through Lock & Key's actual `LnKFlags.matchingIDKeys` API before reporting completion. A locked door without a Keys row is allowed and produces a warning.

## Updates and failure recovery

Reuse permanent scene/wall/light/key IDs. CSI finds its own scenes using IDs, not their display names. Updates preserve tokens and manually added content. Managed walls/lights omitted from a selected category are removed. Existing key Items are reused; omitted old keys are retained so distributed loot is not destroyed.

CSI records the imported values. Later manual edits to those managed values block updating their category unless you explicitly select overwrite. Selecting overwrite applies to selected CSI categories, not manually added walls or inventory. Doors opened during play count as changed state. Keep that category unchecked if its current state should remain.

Update Walls and Keys together when a scene uses key links. Geometry/padding changes require Walls and Lights updates too, and are blocked if the scene contains tokens or other manually placed content. Use a new scene ID for a differently scaled copy. Switch away from an active scene before updating it.

Each selected scene is validated before world changes begin. Invalid scenes are listed and skipped while valid scenes proceed. A failure during a scene attempts to restore that scene and its affected world key Items; a new failed scene and its new keys are removed. The batch continues after a successful rollback. An incomplete rollback stops the batch and is explicitly reported. Uploaded files and newly created empty folders may remain. Reports use selectable text with Copy and Download buttons.

## Future module registration

Register after the `sbsHubReady` hook, or use `game.sbsHub` when it already exists:

```js
function registerWithHub(hub) {
  hub.register({
    id: "sbs-my-module:manager",
    moduleId: "sbs-my-module",
    label: "Open manager",
    gmOnly: true,
    open: () => game.modules.get("sbs-my-module").api.open()
  });
}
Hooks.on("sbsHubReady", registerWithHub);
Hooks.once("ready", () => {
  if (game.sbsHub) registerWithHub(game.sbsHub);
});
```

Re-registering an ID replaces its entry. The owner module must be active. `gmOnly` defaults to true. Explicit registrations support any module ID, not only SBS-prefixed IDs.

## Validation status

Automated tests cover workbook parsing, scenic defaults, scale and padding transforms, key links, repeat imports, manual-edit protection, partial updates, removed content, rollback and hub discovery/permissions. See TEST_REPORT.md for the exact checks and remaining live-world verification. The actual 30-scene self-contained workbook passed the one-XLSX browser import test.

## Bundled dependencies and artwork

SheetJS and JSZip are included locally; importing does not need a CDN or AI service. Their licenses are in `vendor/`. The slug surveyor mascot was generated for SaltyBananaSlug. No hosted API credentials are required.

## Travel scale and source review

The revised travel sheets include Scale Review for each battle map. It shows the original-image pixel spacing and Medium (5 ft) / Large (10 ft) circles. A gridless painting has no absolute real-world ruler: selected scale references are listed so the choice is inspectable. The footbridge is about 5.5 ft wide at the new calibration; mapped doors are at least 5 ft wide. Source spacing below Foundry’s 50 px minimum enlarges the scene and wall/light coordinates uniformly; the embedded image remains unchanged.

Import rejects solid segments crossing door/window opening interiors. The windmill wall now follows the original masonry and leaves the painted lower-right entrance open.

Uniform scale updates preserve placed token centers relative to the image and keep token widths/heights in grid units. Updates containing manual walls, tiles, drawings, notes, sounds or regions continue to block geometry changes. Padding changes with tokens also remain blocked.

## Sidebar layout troubleshooting

Version 0.1.5 refits after activating the slug tab, after sidebar transitions, and when its real container changes height. It supports content containers beside the sidebar navigation, late CSS limits and inner frame wrappers. Only the active SBS tab temporarily stretches its wrappers; previous inline values and priorities are restored when switching away. Observers stop issuing changes once the layout settles.

The ruler button beside Refresh opens a selectable Layout report with viewport dimensions and container bounds. Copy that report if a world-specific theme still prevents full height. It contains layout measurements, not scene or actor data. This module-only update does not require worksheet or scene imports.

## Floating chat input

In Configure Settings → Module Settings → SBS CSI:

- **Hide my floating chat input outside Chat**: personal preference (on by default). Applies while another sidebar tab is selected or the sidebar is collapsed.
- **Player floating chat input**: GM/world policy. **Hide outside Chat** (default) hides it for all players, **Show (Foundry default)** allows it for all players, or **Let each player choose** uses their personal preference. This policy does not override the GM's personal setting. World setting changes apply to connected player clients through Foundry settings synchronization.

Only the separate input and its controls in the notification overlay are hidden. The Chat tab input and deliberately opened chat popouts remain usable. Drafts and notification messages/rolls are preserved; no chat keyboard handler or message creation method is overridden.

The sidebar measures screen-space vs CSS-layout-space heights, accounting for the inherited UI transform. At 75% UI scale, a 690-screen-pixel panel needs 920 CSS pixels. The shared #ui-right container is observed for scale changes but is never resized. This is a module update only; existing scenes and worksheets do not need to be imported again.

When floating chat is hidden, its reserved hotbar offset is cleared so switching sidebar tabs keeps the macro bar centered. Showing floating chat restores Foundry’s normal overlap avoidance. This follows the same GM/player chat visibility policy.
