# SaltyBananaSlug's Pocket Sheets

Pocket Sheets lets a GM place selected players into a phone-friendly, character-sheet-only Foundry mode. It reads the player's real dnd5e Actor and owned Items but presents them through a purpose-built mobile interface instead of shrinking the desktop character sheet.

## Installation

In Foundry VTT Setup, open **Add-on Modules → Install Module** and paste this URL into **Manifest URL**:

`https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/manifests/saltybananaslug-pocket-sheets.json`

The published manifest installs the matching versioned package from the repository's generated `environment-catalog` branch.

## Compatibility

- Foundry Virtual Tabletop v13
- dnd5e 5.x
- Designed first for the official dnd5e character sheet

The mobile sheet includes Attributes, Inventory, Features, Spellbook, a read-only Chat history, Effects, Bastions when present, Biography, and an optional Special Traits page. Other modules can add mobile-native pages through the Pocket Sheets `registerTab` API.

## GM setup

1. Enable the module in the world.
2. Launch the manager from any of these locations:
   - Open the Actors directory and click **Pocket Sheets**.
   - Open **Configure Settings → Module Settings → Pocket Sheets Manager**.
   - Run the automatically created **SaltyBananaSlug's Pocket Sheets** macro.
3. In the manager, select an Actor for each participating player.
4. Check **Pocket Mode** for the players who need the phone interface.
5. Click **Save & Apply**.

The player's assigned sheet opens automatically. Disabling Pocket Mode restores the normal Foundry interface.

## What Pocket Mode changes

- Hides the canvas, scene navigation, controls, sidebar, hotbar, and player list.
- Renders the real Actor's information through a dedicated responsive phone layout.
- Includes Attributes, Inventory, Features, Spellbook, Chat, Effects, Bastions, Biography, and optionally Special Traits.
- Shows the latest 100 chat messages visible to the current player, using Foundry's native message rendering and privacy checks for whispers and blind rolls.
- Refreshes the Chat page when messages are created, changed, or deleted without rebuilding the entire mobile sheet.
- Uses each Item's native dnd5e activities for attacks, damage, saves, healing, casting, utility actions, and normal resource consumption.
- Uses the dnd5e 5.2 Actor roll signatures for checks, saving throws, skills, death saves, and initiative.
- Uses Midi-QOL's supported `completeItemUse` API with the selected attack activity ID, forces that workflow into its attack-roll stage, and keeps the attack configuration prompt enabled. Without Midi-QOL, it falls back to a persisted native dnd5e activity message and its real chat-card Attack control.
- Replaces Pocket Sheet event listeners on every render instead of stacking another copy, and rejects duplicate in-flight item actions so one phone tap creates one workflow, one resource use, and one usage card.
- Deduplicates activity controls to one relevant Attack and one relevant Damage/Healing button per item.
- Automatically closes visible dnd5e activity/roll prompts after a completed Pocket Sheet roll, including fixed-position check and save dialogs that do not have a DOM `offsetParent`.
- Keeps item descriptions expandable in the Pocket Sheet and adds a separate Chat button for the native dnd5e item card.
- Constrains native roll dialogs to the phone viewport so attack prompts cannot open off-screen.
- Shows the full SaltyBananaSlug Pocket Sheets name and installed module version in a compact bottom footer.
- Displays nested container contents in the Inventory tab without duplicating those items in top-level categories.
- Shows Death Saves on Attributes when the character is at 0 HP or already has death-save marks.
- Disables drag start, drag over, drop, item sorting, and browser image/text dragging.
- Cancels a click when a finger moved as part of scrolling.
- Adds a large right-side scroll rail for the currently active sheet tab.
- Remembers scroll position independently for every tab.
- Refreshes only when the Actor, an owned Item, or an Active Effect actually changes.

## Important behavior

Pocket Sheets does not grant additional Actor permissions. Players only receive Pocket Mode for an Actor they own.

Special Traits can contain GM-facing configuration, so that page is hidden by default. A GM can enable it under **Configure Settings → Module Settings → Show Special Traits to Pocket Players**.

## Module tab integration

Modules can register a phone-native page after Pocket Sheets is ready:

```js
game.modules.get("saltybananaslug-pocket-sheets").api.registerTab({
  id: "factions",
  label: "Factions",
  icon: "fa-solid fa-flag",
  visible: (actor, user) => actor.isOwner,
  render: async (actor, user) => "<section class='sbs-pocket-card'>...</section>"
});
```

Closing the character sheet while Pocket Mode is enabled causes it to reopen. A player can always reload the browser; their mode and assigned Actor are restored from the world setting.

## First-build test checklist

- Swipe-scroll Inventory without opening, moving, or duplicating an item.
- Drag the right scroll thumb through a long Inventory or Spellbook tab.
- Roll an ability, save, skill, initiative, weapon attack, and damage.
- Cast leveled spells and confirm slot consumption.
- Use limited-use features, ammunition, charges, and consumables and confirm their activities roll rather than only posting descriptions.
- Reduce the character to 0 HP and roll a death save from Attributes.
- Confirm every ability Check and Save works regardless of proficiency, with proficient saving throws visibly marked.
- Confirm weapons expose Attack and Damage separately and spells expose Cast or Cast & Attack.
- Confirm containers display their contents and contained usable items retain activity buttons.
- Open Chat and confirm public rolls and descriptions appear, while another player's private or blind messages remain hidden as Foundry intends.
- Toggle prepared/equipped states where the normal sheet permits it.
- Verify Bastions appears when the Actor has Bastion data or facilities.
- Enable the Special Traits setting and confirm that page appears.
- Change HP or resources from the GM client and confirm the phone sheet updates.
- Refresh and reconnect the phone client.
- Disable Pocket Mode and confirm the standard Foundry interface returns.
