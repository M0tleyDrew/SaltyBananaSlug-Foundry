# SaltyBananaSlug's Environment v0.4.0

Foundry VTT v13 ecosystem manager for the SaltyBananaSlug module family.

## What changed in v0.4.0

Environment is now GitHub-backed. Google Drive and the Apps Script catalog transport are no longer required.

- Discovers SBS modules from `M0tleyDrew/SaltyBananaSlug-Foundry`.
- Uses the generated `environment-catalog` branch for one-request version checks and install/update manifests.
- Falls back to scanning the public GitHub repository directly if the generated catalog is unavailable.
- New top-level module folders containing `module.json` are discovered automatically; Environment itself does not need to be updated when another SBS module is added.
- Root-level Foundry macro JSON exports are discovered automatically and can be added/updated from the dashboard.
- Shows installed, active, missing, update-available, and uncatalogued SBS modules.
- Keeps a cached GitHub catalog so the dashboard still has useful data if GitHub is temporarily unavailable.

The companion repository workflow builds patched Foundry manifests and per-module ZIP packages into the `environment-catalog` branch whenever `main` changes.
