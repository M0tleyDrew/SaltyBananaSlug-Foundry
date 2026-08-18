# Changelog

## 1.1.2

- Removed browser Blob URLs from the Blank Template and Welch Example downloads.
- Replaced the download buttons with ordinary direct links to ZIP files packaged inside the module.
- Added a visible right-click **Save Link As** fallback for browsers that block normal click downloads.
- No workbook schema or importer behavior changed in this patch.

# 1.1.1

- Replaced the bundled Welch example with one combined 26-item Schema v2 workbook.
- Added all 26 embedded item images to the bundled example.
- Rebuilt the blank Schema v2 template.
- Changed in-module template/example downloads to ZIP packages to prevent operating systems from trying to open XLSX files through an unconfigured app association.

## 1.1.0

- Added Workbook Schema v2 while retaining backward compatibility with the original columns.
- Fixed dnd5e system fields being skipped when the system template lookup returned an empty object.
- Writes rarity, attunement, attuned state, quantity, weight, price, item subtype, base item, properties, uses, source rules, identification, and descriptions directly.
- Added separate Unidentified Description and Chat Description workbook fields with safe fallbacks for older workbooks.
- Automatically creates a dnd5e attack activity for weapons using structured damage, ability, attack bonus, range, and attack-mode fields.
- Added automatic inference for common weapon basics from Base Item, Item Type Text, and item name.
- Added structured fields for mastery, magical bonus, versatile damage, armor data, and Activities JSON.
- Added a mechanics summary and workbook warnings to the import preview.
- Updated bundled blank and Welch example workbooks to Schema v2.
