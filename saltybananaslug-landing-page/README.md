# SaltyBananaSlug's Landing Page

Version **0.6.1** for **Foundry VTT v13** and **D&D5e 5.2.4 or later**.

Build a campaign welcome scene with live party cards, session information, handouts, and optional SBS quest and evidence boards. Widgets follow the scene as players pan and zoom. Artwork first places compact party cards across the top and content boxes along the bottom, with transparent controls and adjustable backgrounds.

## Install

Open **SaltyBananaSlug's Environment**, find **SaltyBananaSlug's Landing Page**, and install it through the manager.

Enable **SaltyBananaSlug's Landing Page** in the world's Manage Modules screen. Reload connected clients after updating.

## Create a landing scene

1. Open Game Settings → Configure Settings → Module Settings → Landing Page — Session Setup.
2. Enter the campaign name, session title, arc, chapter, recap, and announcements.
3. Browse to an image accessible through Foundry. The image becomes the native scene background. Publishing a selected image sizes the scene to its aspect ratio.
4. Choose automatically assigned player characters or select a party manually.
5. Add handouts, useful links, and any optional quest or evidence sections.
6. Set the enabled sections and appearance, then save the draft. Preview as player checks content visibility inside the setup window.
7. Click **Create NEW landing scene**, then view or activate it through Foundry's scene navigation.

**Create launcher macros** adds hotbar launchers for opening and configuring the landing page. Configuration is GM-only.

## Prepare later sessions

Use **New preset** or **Duplicate draft** to prepare another session. Drafts are stored in private Journal entries with generic names. Select a target landing scene and click **Publish to selected landing scene** when ready.

Publishing updates that scene's landing-page configuration. Selecting a background image updates the native background and scene dimensions. Leaving the image field empty preserves an existing background.

Turning off **Display episode title when published** omits the title from the player-facing configuration while retaining it in the GM's draft.

## Appearance and layout

Under **Appearance & text**, choose either **Artwork first** or **Expanded panels**.

- **Artwork first** uses compact horizontal party cards and content-sized lower panels to expose more of the background image.
- **Expanded panels** uses the available panel regions more fully.
- Enabled sections share available rows. Disabled sections leave no reserved slots.
- Each section has independent body/button, heading, and highlighted-text colors.
- Body text supports sizes 12–32, and headings support sizes 12–48. These sizes scale with map zoom and the global text scale.
- Each box has an opacity override. Use **−1** to inherit the global opacity, **0** for a transparent background, or a value up to **1** for a solid background.
- Character cards and link buttons have transparent fills. Portraits fit their regions, names wrap, and long panel contents scroll.

New presets use global opacity **0.25**. Existing presets retain their saved opacity. For a lighter look, lower the global value to **0.2** or **0**, then save and publish.

## Navigation

| Action | Control |
| --- | --- |
| Pan the scene from a card, portrait, label, or button | Right-drag or middle-drag |
| Open a permitted sheet, handout, or link | Left-click |
| Read long panel content | Scroll inside the panel |
| Zoom around the cursor over a widget | Ctrl + wheel, or Cmd + wheel |
| Zoom around the available play-area center | On-screen − / + buttons |
| Frame the scene around the sidebar | Fit map |
| Hide or reopen widgets for your client | Hide widgets / launcher macro |

Fit map includes 12% clear framing space on each side. Click it after changing the sidebar or window size. While the landing page is open, the client zoom-out limit extends to one quarter of the fit scale. Closing the widgets or leaving the scene restores the previous limit.

## Party cards and permissions

The party region expands for extra rows and scales cards when space is tight, keeping the entire selected party visible without an internal scrollbar. Map zoom can enlarge the cards for large rosters. Lower panels retain their own scrolling.

All selected party members appear by name and portrait, including characters whose sheets the viewer cannot access. Publishing includes a name-and-portrait roster for clients missing actor documents.

Observer access enables sheet actions and character statistics. HP modes include exact HP with temporary HP, a health bar, a health description, and owner/GM-only HP. Optional information includes player names, class and level, AC, passive Perception, Inspiration, and conditions.

The dashboard follows actor, item, effect, and player updates. Its HP display settings control the dashboard presentation. Existing actor permissions still govern access to character sheets.

## Handouts and links

Open **Handouts, journals & uploads** to select existing Journals, drag entries or pages into the drop area, or create new handouts.

- **Upload / choose image or PDF** opens Foundry's file browser. Upload or select a file, then confirm the selection to create a new journal and attach it to the draft.
- **Create text handout** creates a new journal and opens its sheet for editing.
- **Allow all players to view the new handout** sets ownership for newly created handouts. Existing journals retain their permissions.
- Reorder selected handouts with the arrows, then save and publish.

Useful links has separate **Button label** and **Website address or document UUID** fields. Complete both fields before saving, previewing, or publishing. Website links use HTTP/HTTPS and open in another tab. Document links respect Foundry permissions.

## Optional integrations

- **SBS Quests & Objectives** (`saltybananaslug-quests-objectives`) supplies active quests and revealed objectives. Party, private, and GM visibility rules apply.
- **SBS Evidence Board** (`saltybananaslugs-evidence-board`) supplies boards the viewer can access and opens the selected board.

Each integration's section is hidden when its module is unavailable. The module can also operate with party cards, session information, journals, and links alone.

## Updating from earlier test versions

Existing presets and landing scenes are supported. Open Configure to choose the current appearance options, save the draft, and publish to the existing landing scene. Republishing refreshes the public party roster. The image field controls whether publishing also updates the native background and dimensions.

## Validation

The source was checked against Foundry v13.347. The v0.6.1 automated suite contains 20 passing checks covering party visibility, HP and quest permissions, links, handouts, scene publishing, appearance normalization, map alignment, zoom limits, and drag navigation.

Run the checks from this module folder with Node.js.

```sh
node --test tests/*.test.mjs
```

Automated checks use mocked Foundry data and do not constitute a complete multi-client compatibility test.

## Launcher API

```js
game.modules.get("saltybananaslug-landing-page").api.open();
game.modules.get("saltybananaslug-landing-page").api.configure();
game.modules.get("saltybananaslug-landing-page").api.hide();
```

See [CHANGELOG.md](CHANGELOG.md) for version history. Report issues through the [repository issue tracker](https://github.com/M0tleyDrew/SaltyBananaSlug-Foundry/issues), including Foundry, D&D5e, and module versions.

