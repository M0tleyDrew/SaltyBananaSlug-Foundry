# NPC Memories 0.1.2 validation

- JavaScript syntax check passed.
- Ten DOM checks passed: native panels (Features, Inventory, Spells, Effects, Biography, Memories, Special Traits), native switching, fallback switching with duplicate prevention, and player UI cleanup.
- Inactive/hidden memory panel CSS guard checked.
- Compared tab markup and context against the D&D5e release-5.2.4 source.
- No changes to memory journal storage or data schema.

Local pre-release checks: open an existing NPC, switch Biography → Memories → Features → Biography, close/reopen on both Memories and Biography, add/save a memory, and check with a player account.

User confirmed the v0.1.2 fix works in their running Foundry installation before publication.
