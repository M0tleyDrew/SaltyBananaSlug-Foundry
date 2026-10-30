# Actor Forge 1.0.2 — Biography repair

Made by SaltyBananaSlug.

## Install

Close Foundry. Replace the existing `Data/modules/sbs-actor-forge` folder with the `sbs-actor-forge` folder in this ZIP. Restart Foundry and verify Actor Forge shows 1.0.2.

## Check

Open one existing NPC directly and look in Biography → Details. The native Public section is a separate field and may be blank. The Forge Biography shortcut now opens at native Details instead of skipping to the appended SBS notes.

For a new import or an update using an existing Actor ID / Match Actor Key, supplied biography fields are checked after saving and repaired if blank. Existing merge-conflict choices still apply. Installing this update alone does not reimport old worksheets.

Do not reimport an entire workbook as new actors unless you want duplicate actors. Test one NPC first.

## Validation and limits

All 17 Marl workbook biographies were present in the 1.0.1 parser output. The shortcut scroll defect is confirmed in code. Regression tests exercise imports, export, repair after a dropped field, persistent failure and Undo. These tests use a mock Foundry world, not a running Foundry installation. A live test is still required to establish whether another module or sheet also affects your NPC descriptions.
