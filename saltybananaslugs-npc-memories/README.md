# SaltyBananaSlug's NPC Memories v0.1.1

A GM-facing memory system for Foundry VTT v13 + D&D5e 5.2.x.

## What it does

- Adds a **Memories** tab directly to the default D&D5e NPC sheet.
- Keeps the tab GM-only.
- Stores NPC memory data in one GM-only Journal database rather than normal NPC Actor flags.
- Supports memory title, details, category, importance, emotional tone, campaign date, tags, related Actor, pinning, archiving, editing, deleting, searching, and filtering.
- Related Actors can be assigned by dragging an Actor or token into the memory form.
- Uses the SBS banana-slug logo supplied for the module.
- Exposes a shared API for other SBS modules.

## Merchant compatibility

The memory system is deliberately independent of SBS merchant inventory and treasury data.

Generated SBS merchants keep memories on their merchant shell NPC Actor (displayed using the clean merchant name rather than the `[Merchant Shell]` prefix). Linked existing NPC merchants keep memories on the linked NPC Actor. The merchant module can record events through the shared API after its GM-authoritative transaction succeeds.

Two integration hooks are already listened for:

```js
Hooks.callAll("sbsMerchants.transactionCompleted", merchantActor, {
  type: "purchase", // purchase | sale | transaction | interaction
  customerActor,
  title: "Bought the cursed spoon",
  summary: "Bob bought the cursed spoon for 15 gp.",
  itemName: "Cursed Spoon",
  quantity: 1,
  amount: 15,
  currency: "gp",
  transactionId: "optional-id",
  tone: "positive",
  importance: "normal"
});
```

```js
Hooks.callAll("sbsMerchants.favorChanged", merchantActor, customerActor, {
  from: "Neutral",
  to: "Friendly",
  reason: "Returned the stolen shipment."
});
```

The Merchants v0.1.6 bridge build included alongside this module emits those hooks from its existing active-GM transaction/favor code. Merchants does not store or understand the memory database; NPC Memories remains the owner of all memory data. Older Merchants builds still work normally, but automatic transaction/favor memories require the bridge hooks or direct API calls.

## API

Available as either:

```js
game.sbsNpcMemories
```

or:

```js
game.modules.get("saltybananaslugs-npc-memories").api
```

### Read memories

```js
await game.sbsNpcMemories.get(actor);
await game.sbsNpcMemories.get(actor, { archived: false, category: "transaction" });
```

### Add a manual/system memory

```js
await game.sbsNpcMemories.add(actor, {
  title: "The party lied about the mayor",
  body: "Caught Bob contradicting the story later.",
  category: "information",
  importance: "important",
  tone: "negative",
  relatedActorUuid: bob.uuid,
  tags: ["party", "lie"]
});
```

### Update / delete

```js
await game.sbsNpcMemories.update(actor, memoryId, { pinned: true });
await game.sbsNpcMemories.remove(actor, memoryId);
```

### Merchant convenience method

```js
await game.sbsNpcMemories.recordMerchantEvent(merchantActor, {
  type: "purchase",
  customerActor,
  summary: "Bought three healing potions.",
  itemName: "Potion of Healing",
  quantity: 3,
  amount: 150,
  currency: "gp"
});
```

### Future faction convenience method

```js
await game.sbsNpcMemories.recordFactionEvent(actor, {
  title: "Promoted by the Dockworkers' Guild",
  summary: "The party secured the eastern warehouse.",
  tone: "positive",
  importance: "important",
  metadata: { factionId: "dockworkers", reputationDelta: 2 }
});
```

### Quest convenience method

```js
await game.sbsNpcMemories.recordQuestEvent(actor, {
  questId: "quest-id",
  title: "The party completed the delivery",
  summary: "The medicine arrived intact.",
  tone: "positive"
});
```

## Hooks emitted by NPC Memories

```js
Hooks.on("sbsNpcMemories.memoryCreated", (actor, memory) => {});
Hooks.on("sbsNpcMemories.memoryUpdated", (actor, memory) => {});
Hooks.on("sbsNpcMemories.memoryDeleted", (actor, memory) => {});
Hooks.on("sbsNpcMemories.actorPurged", actor => {});
```

These give the future Faction Manager (or anything else) a clean place to react to memories without coupling the modules together.

## Install

Extract the folder so the path is exactly:

```text
Data/modules/saltybananaslugs-npc-memories/module.json
```

Restart Foundry and enable **SaltyBananaSlug's NPC Memories**.

## Target

- Foundry VTT v13
- D&D5e 5.2+
- Built against D&D5e 5.2.4's ApplicationV2 NPC sheet structure

## Test checklist

1. Enable the module as GM.
2. Open a D&D5e NPC Actor sheet.
3. Confirm a **Memories** tab with a brain icon appears between Biography and Special Traits.
4. Add a memory, close the sheet, reopen it, and confirm the memory persists.
5. Edit, pin, archive, restore, filter, and delete a memory.
6. Drag another Actor or a token into the Related Actor field and save.
7. Log in as a player and confirm the Memories tab is not present.
8. Confirm the GM has a single **SBS NPC Memories Database** Journal containing one page per NPC that has saved memories.
9. From the console as GM, run `await game.sbsNpcMemories.add(canvas.tokens.controlled[0].actor, {title:"API test"})` and confirm it appears on that NPC's Memories tab.


## v0.1.1 fixes

- Fixed saving by removing the nested form from the D&D5e NPC sheet.
- Related Actor/token drops now intercept the native sheet drop handler so they do not trigger Actor transformation behavior.
- Added more tolerant drag-data parsing and clearer errors.
