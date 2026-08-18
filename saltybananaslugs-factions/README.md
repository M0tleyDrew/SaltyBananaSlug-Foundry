# SaltyBananaSlug's Factions v0.1.0

A GM-facing faction and reputation system for Foundry VTT v13 + D&D5e 5.2+.

## Core features

- Create any number of factions with descriptions, GM notes, tags, custom art, and a private event log.
- Party-wide reputation from -100 to +100.
- Optional per-character reputation overrides; characters otherwise inherit party reputation.
- Drag Actors or scene Tokens into a faction as members.
- Merchant Tokens are recognized as merchant members when SBS Merchants is installed.
- Track faction-to-faction relationship scores and notes.
- Configure standing tiers and their positive/negative consequences.
- Default tiers: Hostile, Unfriendly, Neutral, Friendly, Favored, Allied.
- Reputation changes expose hooks/API for quests and future SBS systems.

## Consequences

Each standing tier may configure:

- **Merchant favor** — automatically maps a character's effective faction standing to favor at member SBS merchants. Existing GM-set custom customer buy/sell rates are preserved and continue to override favor pricing.
- **NPC token disposition** — party-wide standing may switch member tokens between Hostile, Neutral, or Friendly.
- **NPC memories** — member NPCs can remember reputation gains/losses, reasons, tier changes, and the related character.

Individual reputation never changes a token's global disposition; it can still change that character's merchant favor and create related NPC memories.

## Integrations

### SBS NPC Memories

Optional, requires v0.1.1+. Uses `game.sbsNpcMemories.recordFactionEvent(...)`. No NPC Memories update is required.

### SBS Merchants

Optional, requires v0.1.7+ for the clean public integration API. Factions uses merchant relationship logic rather than editing merchant flags directly.

## Runtime API

```js
game.sbsFactions.open();
game.sbsFactions.list();
game.sbsFactions.get(factionId);
game.sbsFactions.create({ name: "The Silver Hand" });
game.sbsFactions.changeReputation(factionId, "party", 10, { reason: "Saved their patrol." });
game.sbsFactions.changeReputation(factionId, actor, -15, { reason: "Insulted the commander." });
game.sbsFactions.setReputation(factionId, actor, 50, { reason: "Promoted to trusted agent." });
game.sbsFactions.applyEffects(factionId);
```

Useful hooks:

- `sbsFactions.reputationChanged`
- `sbsFactions.tierChanged`
- `sbsFactions.memberAdded`
- `sbsFactions.effectsApplied`
