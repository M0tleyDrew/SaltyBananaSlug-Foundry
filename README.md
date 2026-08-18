<p align="center">
  <img src="saltybananaslugs-environment/assets/sbs-logo.svg" alt="SaltyBananaSlug logo" width="240">
</p>

<h1 align="center">SaltyBananaSlug Foundry Modules</h1>

<p align="center">
  A growing collection of Foundry VTT modules built to make running, organizing, and playing campaigns easier, weirder, and considerably more banana-slug-approved.
</p>

---

## Installing in Foundry VTT

### Recommended: install SaltyBananaSlug's Environment

**SaltyBananaSlug's Environment** is the easiest way to install and keep the SBS module collection up to date.

1. Open **Foundry VTT Setup**.
2. Go to **Add-on Modules**.
3. Click **Install Module**.
4. Paste this manifest URL into the **Manifest URL** field:

   `https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/manifests/saltybananaslugs-environment.json`

5. Click **Install**.
6. Launch your world and enable **SaltyBananaSlug's Environment** under **Manage Modules**.
7. Open the SBS Environment manager to browse, install, and update the rest of the SaltyBananaSlug modules.

Environment uses this repository as its source of truth and automatically discovers SBS module folders published here.

### Manual installation

Any SBS module can also be installed directly through Foundry's **Install Module** window using its generated manifest from the `environment-catalog` branch.

Manifest URLs follow this format:

`https://raw.githubusercontent.com/M0tleyDrew/SaltyBananaSlug-Foundry/environment-catalog/manifests/MODULE-ID.json`

Replace `MODULE-ID` with the module's folder/module ID shown in the catalog below. After installation, enable the module from **Manage Modules** inside your world.

> **Dependencies:** Some modules require or work best with other Foundry modules. Foundry may prompt you to install required dependencies. Any important dependencies are also listed below.

---

## Module Catalog

| Module | What it does | Notes / Dependencies |
| --- | --- | --- |
| **Party Viewer**<br>`party-viewer` | A lightweight party dashboard with shared storage, trade offers, shared/private/GM notes, and quick party information. | D&D5e. **Requires SocketLib.** |
| **Actor Journal**<br>`saltybananaslug-actor-journal` | Creates detailed, player-safe multi-page Journal entries from D&D5e Actors using a selected token, directory selection, or drag-and-drop. | D&D5e. |
| **Card Games**<br>`saltybananaslug-card-games` | Multiplayer Texas Hold'em, Five-Card Draw, and Blackjack inside Foundry, including private hands, NPC seats, betting, side pots, splits, doubles, insurance, and surrender. | **Requires SocketLib.** |
| **Character Sheets**<br>`saltybananaslug-character-sheets` | Exports expanded, player-safe D&D5e character sheets and standalone spellbooks as linked HTML or properly paginated PDFs. | D&D5e. |
| **Containers**<br>`saltybananaslug-containers` | Adds independent scene containers with private inventories, journals, locked/open states, player transfers, identification controls, and GM management without Item Piles. | D&D5e. **Requires Lock & Key 5.0.5+.** |
| **Item Uploader**<br>`saltybananaslug-item-uploader` | Imports batches of fully configured D&D5e Items from XLSX workbooks, including descriptions, attacks, rarity, uses, images, folders, scaling write-ups, and raw Foundry JSON. | D&D5e. Includes a blank template and example workbook. |
| **Merchants**<br>`saltybananaslug-merchants` | Adds full merchants with private stock, player buy/sell carts, character-specific favor pricing, finite treasury, inventory imports, transaction journals, merchant tokens, sounds, and identification controls. | D&D5e. Integrates with **NPC Memories** and **Factions**. |
| **Quests & Objectives**<br>`saltybananaslug-quests-objectives` | A video-game-style quest tracker with GM quests, private personal quests, hidden/sequential objectives, visibility controls, tracking, resets, scene controls, and SBS launchers. | Designed for shared GM/player campaign tracking. |
| **Scene Piles**<br>`saltybananaslug-scene-piles` | Converts Item Piles into draggable Item-link Journals, optionally pins them to Scenes, and can rebuild Item Piles from linked Journal contents. | **Requires Item Piles.** Item Piles D&D5e integration recommended. |
| **Scene Summarized**<br>`saltybananaslug-scene-summarized` | Builds detailed linked Journal dossiers from a Scene, including creatures, NPCs, SBS Containers/Merchants, inventory, sounds, lights, notes, walls, regions, media, and optional GM context. | Especially useful for session prep and scene documentation. |
| **Web Viewer**<br>`saltybananaslug-web-viewer` | Shares website links, temporary uploaded images/audio, direct media, and monitored YouTube embeds with players inside Foundry. | Uses Foundry sockets for sharing. |
| **Danger Zones**<br>`saltybananaslugs-danger-zones` | Creates tactical danger or safe-zone telegraphs with countdown attacks, repeating hazards, saves, damage, healing, messages, initiative integration, movement patterns, and presets. | D&D5e. |
| **Environment**<br>`saltybananaslugs-environment` | The SBS ecosystem manager: discovers modules from GitHub, checks versions, installs/updates modules, manages manifests/packages, and installs SBS macros. | **Recommended first install.** Foundry v13. |
| **Evidence Board**<br>`saltybananaslugs-evidence-board` | A shared corkboard-style investigation board where users can drag in Actors, Items, Journals, Scenes, notes, and images, then connect evidence with labeled strings. | Per-board view/edit permissions and locking. Foundry v13. |
| **Factions**<br>`saltybananaslugs-factions` | Manages factions, reputation, membership, inter-faction relationships, consequences, and faction-driven NPC reactions. | D&D5e. Works best with **NPC Memories** and **Merchants**. |
| **Lore Module**<br>`saltybananaslugs-lore-module` | Organizes campaign lore and multiple-choice quizzes into reusable chapter sets, tracks player results, and supports importing/exporting complete lore collections. | Great for campaign lore dumps, quizzes, and player knowledge checks. |
| **Message Cantrip**<br>`saltybananaslugs-message-cantrip` | Sends private magical-message popups between selected Foundry users while also recording the message privately through whisper chat. | Lightweight and system-agnostic. |
| **NPC Memories**<br>`saltybananaslugs-npc-memories` | Adds a GM-facing Memories tab to NPC sheets so NPCs can remember interactions, events, and reputation changes, with integration hooks for other SBS modules. | D&D5e. Integrates with **Merchants** and **Factions**. |

---

## SaltyBananaSlug's Environment

This repository is the source of truth for the SBS Foundry ecosystem. A GitHub workflow scans top-level folders containing `module.json` whenever `main` changes and publishes a generated `environment-catalog` branch containing:

- a compact SBS module catalog;
- Foundry-ready module manifests;
- per-module install ZIP packages; and
- version/install information consumed by **SaltyBananaSlug's Environment**.

Because discovery is automatic, new SBS modules can be added to this repository without hard-coding a fixed module list into Environment.

---

## Compatibility

The SBS suite is primarily developed and tested for **Foundry VTT v13**. Several modules are specifically designed for the **D&D5e** game system; check the module catalog above for system requirements and dependencies.

---

<p align="center">
  <strong>SaltyBananaSlug</strong><br>
  Foundry tools for GMs who already have enough nonsense to keep track of.
</p>
