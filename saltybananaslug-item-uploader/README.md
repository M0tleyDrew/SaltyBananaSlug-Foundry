# SaltyBananaSlug's Item Uploader

A Foundry VTT v13 module for importing many world Items from one `.xlsx` or `.xlsm` workbook.

## Features

- Imports any mixture of weapons, equipment, consumables, tools, loot, containers, features, and spells.
- Class requirements and scaling tiers are optional. General items work normally.
- Uses a dedicated **Foundry Import** sheet, with backward compatibility for the Welch **Machine Data - Do Not Edit** sheet.
- Preview and validation before import.
- Update, skip, or duplicate conflict modes.
- Creates nested Item folders from slash-separated folder paths.
- Extracts pictures embedded on the **Item Images** sheet, uploads them into Foundry's data folder, and assigns them to Items.
- Supports a normal Foundry image path when no embedded image is provided.
- Optional **Raw JSON** merges full Foundry Item data, preserving effects and other advanced configuration. Structured workbook fields now create dnd5e weapon attacks, damage, range, rarity, item uses, unidentified descriptions, and chat descriptions automatically.
- Includes downloadable blank and populated example workbooks inside the module.

## Installation

Extract the `saltybananaslug-item-uploader` folder into Foundry's `Data/modules` directory, restart Foundry, and enable **SaltyBananaSlug's Item Uploader** in the world.

## Opening the uploader

A button is added to the Item sidebar for GMs. It is also available from the console or a Script Macro:

```js
game.saltyBananaSlugItemUploader.open();
```

## Embedded images

1. Open the **Item Images** sheet.
2. Put the exact Item ID in column A.
3. Insert the image over the large cell in column B on the same row.
4. Use Excel's ordinary **Place over Cells** image mode. Excel's newer **Place in Cell** rich-image format is not supported.
5. Save the workbook and import it with **Upload embedded workbook images** enabled.

## Workbook rules

Only `Name` and `Foundry Type` are required. `Item Scope`, `Required Class`, `Scaling Levels`, and Tier fields are optional. `Item ID` is strongly recommended because it allows later workbooks to update the same Item reliably.

## Raw JSON

Paste a complete or partial exported Foundry Item JSON object into the Raw JSON column. The workbook row's Name, Foundry Type, folder, image, description, and uploader flags remain authoritative. Invalid JSON is reported during preview rather than detonating halfway through the import like a kobold-made toaster.


## Workbook Schema v2

Version 1.1 adds structured dnd5e fields after the original columns. Older workbooks remain readable. New columns include Identifier, Unidentified Description, Chat Description, Properties, Base Item, Weapon Ability, Magic Bonus, Attack Bonus, Damage Dice, Damage Bonus, Damage Type, Versatile Damage, Range, Long Range, Reach, Weapon Mastery, Attack Mode, Proficient, Uses Max, Uses Recovery, Attuned, armor fields, source rules, and Activities JSON.

For weapons, the uploader creates a dnd5e attack activity automatically. If structured mechanics are omitted, common weapon basics are inferred from Base Item or Item Type Text. Activities JSON or Raw JSON can still be used for multiple attacks or specialized automation.


## v1.1.2 workbook downloads

The in-module Blank Template and Welch Example controls are ordinary direct links to ZIP files packaged with the module. They no longer create temporary browser Blob URLs. Extract the XLSX file before importing it. If a browser blocks the click, right-click the link and choose **Save Link As**. The Welch example is one combined 26-item Schema v2 workbook with all embedded images.
