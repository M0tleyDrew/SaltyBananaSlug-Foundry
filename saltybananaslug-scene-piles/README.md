# SaltyBananaSlug's Scene Piles

A Foundry VTT v13 module for converting Item Piles to draggable Journal item links and converting linked Journal items back into Item Piles.

## Install

1. Extract the `saltybananaslug-scene-piles` folder into Foundry's `Data/modules` folder.
2. Enable **SaltyBananaSlug's Scene Piles** and **Item Piles** in the world.
3. Reload the world.
4. The module creates a launcher Macro named **SaltyBananaSlug's Scene Piles** in the Macro Directory. Drag it to the hotbar.

## Launcher macro

If the auto-created macro is deleted, make a Script Macro containing:

```js
game.modules.get("saltybananaslug-scene-piles")?.api?.open();
```

## Use

- Select an Item Pile token and click **Load Selected Item Pile**, or drag an Item Pile token into the window.
- Click **New Journal** to create a Journal containing stable, draggable links to duplicated world Items.
- Enable **Pin the Journal to the current Scene** to create a map Note at the selected token or the center of the current view.
- Drag any Journal containing working Item UUID links into the window, then click **Create Item Pile**.
- Individual Items can also be dragged into the window to build a new Journal or pile.
- Journals created by this module can be loaded and updated in place.

The module automatically reuses the existing SaltyBananaSlug image from the Web Viewer, Message Cantrip, or Party Viewer module when one is installed. Its included fallback image can be replaced at `assets/saltybananaslug.svg`.

The module stores backing Items in the folder **SaltyBananaSlug Scene Pile Items** so Journal links remain valid even if the original pile is deleted.
