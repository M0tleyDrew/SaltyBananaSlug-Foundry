# SaltyBananaSlug Foundry Modules

A collection of SaltyBananaSlug modules for Foundry VTT.

## Included modules

- Party Viewer
- Actor Journal
- Card Games
- Character Sheets
- Containers
- Item Uploader
- Merchants
- Quests & Objectives
- Scene Piles
- Scene Summarized
- Web Viewer
- Danger Zones
- Environment
- Evidence Board
- Factions
- Lore Module
- Message Cantrip
- NPC Memories

## SaltyBananaSlug's Environment

SaltyBananaSlug's Environment uses this repository as the source of truth for the SBS module ecosystem. A GitHub workflow scans top-level folders containing `module.json` whenever `main` changes and publishes a generated `environment-catalog` branch containing a compact catalog, Foundry-ready manifests, and per-module install ZIPs.

New SBS module folders are therefore discovered automatically without hard-coding them into Environment.
