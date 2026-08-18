# SaltyBananaSlug's Actor Journal

Creates a detailed, multi-page Foundry journal from a D&D5e Actor.

## Supported setup

- Foundry VTT v13
- D&D5e 5.2.x (verified against 5.2.4)

## Installation

1. Extract the `saltybananaslug-actor-journal` folder into Foundry's `Data/modules` folder.
2. Restart Foundry and enable **SaltyBananaSlug's Actor Journal** in the world.
3. On first load, the module creates an **Actor to Journal** script macro in the Macro Directory. Drag it to your hotbar.

You can also create your own Script macro using the contents of `macros/launch-actor-journal.js`.

## Actor selection

- Control a token, then launch the macro.
- Click **Use Selected Token**.
- Choose a world Actor from the dropdown.
- Drag an Actor or Token into the drop zone, including Actors from compendiums.
- Right-click a world Actor in the Actor Directory and choose **Create / Update Actor Journal**.

## Journal organization

Generated journals may contain these pages:

- Overview
- Biography
- Mechanics
- Abilities & Features
- Spells & Equipment
- GM Notes

Each generated page is tagged by the module. Updating an existing linked journal replaces only generated pages, preserving any pages you added manually.

## Permissions

The journal is **GM-only by default**. It can instead be shared with:

- All players
- Players who own the Actor
- Specific selected players

When the journal is shared, the Overview page is visible. Biography and mechanical pages have separate visibility checkboxes. The GM Notes page remains GM-only.

## Extra features

- Journal title defaults to the Actor name but is editable.
- Portrait or prototype-token image selection.
- Existing linked journal detection and safe updating.
- Optional Actor-to-journal UUID link.
- Journal folder selection or automatic creation of an `Actor Profiles` folder.
- Optional exclusion of unidentified items.
- Configurable one-line, medium, or full item descriptions.
- Public and GM-only roleplaying questions.
- Unlimited custom question-and-answer rows.

## Branding

- Uses the standard SaltyBananaSlug logo in the launcher macro and journal wizard.
- Existing launcher macros are automatically updated to use the shared logo when the world loads.
