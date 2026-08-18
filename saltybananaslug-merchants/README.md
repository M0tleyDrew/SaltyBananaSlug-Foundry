# SaltyBananaSlug's Merchants v0.1.7

A standalone Foundry VTT v13 + D&D5e merchant/storefront system. It does **not** use Item Piles.

## v0.1.3 sprite/scale/currency fixes

- Dragonborn sprites were rebuilt with a clearly draconic head: paired horns, side jaw spikes/frills, scaled brow, yellow slit eyes, and a muzzle/nostrils instead of the old single side triangle.
- Bundled sprite files now live under a versioned v0.1.3 asset path so player browsers must fetch the same fresh art instead of reusing a stale cached SVG.
- Generated merchant token textures now explicitly use `scaleX: 1` and `scaleY: 1`, matching the stable SBS Containers token setup.
- Sprite content is enlarged/reframed inside the 64×64 canvas so merchants visibly occupy more of their one-grid-square token.
- Existing generated merchants using prior bundled art migrate to the v0.1.3 sprite path on GM login. Linked NPC art and custom images are untouched.
- Player currency is no longer normalized/re-denominated after transactions.
- Selling to a merchant adds only the payout denominations to the character's current purse; existing coins remain exactly as they were.
- Buying removes the required value from existing coins and only breaks a higher coin when change is actually required.
- Merchant transaction currency uses the same non-destructive add/spend behavior. Explicit GM treasury editing still respects the exact denominations entered.

## v0.1.1 interaction/art/UI fixes

- Generated merchant art was rebuilt as transparent, chunky **32-bit-era RPG-style sprites**.
- Sprite appearance is chosen independently with Species + Presentation/Build + Merchant Style. Presentation options include masculine, feminine, androgynous/neutral, sturdy/broad, and slender/elegant silhouettes; they are appearance choices rather than identity restrictions.
- Existing v0.1.0 generated merchant tokens using the old bundled art are migrated to the new androgynous/neutral sprite for their species/style on GM login. Custom images and linked NPC art are never replaced.
- Player double-click interaction now has three routes: normal Token interaction, TokenLayer fallback, and a canvas-level pointer/double-click bridge for GM-only shell Actors. This is specifically for generated merchants whose shell Actor is intentionally not owned by players.
- Merchant audio is primed during the player's click gesture, then the configured greeting plays after the GM validates and returns the storefront snapshot.
- Wizard and storefront sizing was hardened: smaller viewport bounds, four-column responsive grids, wrapping footer/buttons/inline controls, and no fixed-height buttons.

## Core design

- Generated merchants use a lightweight GM-only shell Actor for a valid Foundry token.
- Merchant stock and treasury live in a separate GM-only inventory Actor.
- Linked existing NPC tokens keep their normal Actor, equipment, and sheet completely untouched; SBS shop stock remains separate.
- Player transactions are validated and executed by the active GM client over the module socket.
- Every merchant automatically creates a companion Journal ledger.

## Merchant creation

The **SBS Merchant Creator** wizard is resizable, viewport-aware, internally scrollable, and uses high-contrast controls.

You can:

- Create and place a generated merchant token after finishing the wizard.
- Link the merchant system to a selected existing token instead.
- Choose shop type, species, sprite presentation/build, merchant style, token tint, built-in pixel-sprite art, or custom art.
- Save custom art to the world's merchant-art choices.
- Drag Items, Journals, Journal Pages, or RollTables into starting stock.
- Use Journal imports from prior loot conversions without altering the source Journal.
- Set stock quantity to a number or **X**. `X` means truly infinite stock and never decrements.
- Mark supported D&D5e stock **Identified** or **Unidentified** during creation and later from the GM merchant window.
- Set a greeting/open sound, volume, and whether it plays for players, GM, or both. The Sound tab includes a live Preview button.

## Pricing and favor

Defaults:

- Merchant sells to players at **100%** item value.
- Merchant buys from players at **60%** item value.

Editable favor levels can change both rates per character. Character-specific custom rates override the assigned favor level. Item-specific customer sale prices can override percentage pricing. Merchant buyback uses the merchant/character buy rate so pricing metadata never follows an item into a player inventory.

Default favor levels included: Hated, Unfriendly, Neutral, Friendly, Favored, Beloved.

## Player buying and selling

Players choose one of their owned character Actors when shopping.

Buying:

- Only GM-enabled stock is visible.
- Base-value-0 items are hidden by default unless the GM explicitly enables sale for that stock item.
- Infinite `X` stock displays as unlimited and never decreases.
- Unidentified stock uses its unidentified/generic presentation in the SBS storefront.
- Purchase transfers the Item to the player's Actor and removes/decrements merchant stock when finite.

Selling:

- Player opens the **Sell** tab and drags Items from the selected character sheet into the offer area.
- Nothing transfers while building the offer.
- The player can add/remove lines and change quantities before accepting.
- The offer updates using that character's favor/custom rate.
- On acceptance, items leave the player Actor and payment is added to that Actor's D&D5e currency.
- By default merchants will not buy currently equipped items, zero-value items, or unsupported item types unless the GM enables those rules.

## Treasury

The merchant has real D&D5e currency plus a **Maximum Buying Funds** cap. The amount it may spend buying player goods is the lesser of its current cash and configured maximum, unless Unlimited Funds is enabled.

Customer payments may be added to the merchant treasury and optionally capped at Maximum Buying Funds.

## Journal ledger

Every merchant creates a Journal named:

`Merchant Name — Scene Name`

Duplicates become `... 2`, `... 3`, and so on.

Pages include:

- Storefront
- Inventory & Treasury
- Customer Relations
- Transaction Ledger
- GM Notes

The ledger records purchases, player sales, GM stock additions/removals, Journal/Table imports, favor changes, treasury changes, identification changes, restocks, linking, and general merchant setting edits.

The merchant ledger Journal is GM-only so treasury data, transaction history, favor relationships, and GM notes are never exposed through the Journal. Players use the dedicated storefront UI.

## RollTables

Drop a RollTable into the creator or an existing merchant as GM. You may draw linked Item results or add all linked Item results. Text/non-Item results are skipped rather than converted into fake items.

## Launchers

The module creates an **SBS Merchants** Macro folder with:

- **SBS Merchant Creator**
- **SBS Merchant Manager**

GM Token Controls also get Creator and Manager buttons.

Runtime API:

```js
game.sbsMerchants.create();
game.sbsMerchants.manager();
game.sbsMerchants.open();
game.sbsMerchants.edit();
```

## Target

- Foundry VTT v13
- D&D5e 5.x

No Item Piles dependency.


## v0.1.3
- Added built-in undead merchant species: Vampire, Skeleton, and Wraith.
- New merchants default to Neutral favor.
- Generated merchant sprites moved to a new versioned asset path to force fresh client art and address player/GM sprite-size mismatches.
- Generated shell actors now also carry explicit prototype-token 1x1 scale data.


## v0.1.5
- Fixed merchant greeting sounds by moving player playback to the successful GM-validated storefront-open socket path.
- Greeting playback is no longer dependent on storefront render timing.
- Failed audio attempts no longer permanently mark a greeting as already played.
- Preserves v0.1.4 token sizing, sprites, and smaller default windows unchanged.


## NPC Memories integration (v0.1.6)

When **SaltyBananaSlug's NPC Memories** is enabled, successful customer purchases, customer sales, and favor changes are emitted as integration hooks after the GM-authoritative merchant operation succeeds. NPC Memories v0.1.0 listens to these hooks automatically.

- `sbsMerchants.transactionCompleted(merchantActor, event)`
- `sbsMerchants.favorChanged(merchantActor, customerActor, change)`

Generated merchants use their shell NPC Actor as the memory owner. Linked merchants use the linked NPC Actor. Merchants does not depend on NPC Memories; without it, the hooks are harmless.


## v0.1.7 integration API

SBS Factions and other GM-side modules may use:

- `game.sbsMerchants.findByActor(actor)` — returns SBS merchant TokenDocuments using that Actor.
- `game.sbsMerchants.getFavorLevels(token)` — returns the merchant's configured favor tiers.
- `game.sbsMerchants.setRelation(token, actor, patch)` — updates a customer relationship through the merchant's normal ledger/config path. `patch.reason`, `patch.source`, and `patch.emitHook` are control fields and are not stored as customer pricing data.
