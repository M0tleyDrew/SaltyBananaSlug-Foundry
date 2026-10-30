# Actor Forge changelog

## 1.0.2 — 2026-10-29

- Open Biography at the native description instead of scrolling past it to SBS Details.
- Verify supplied native biography text after actor creation and updates; repair blank fields with a document update. Report a failed import if Foundry continues to discard the text.
- Keep Public biography separate; never copy GM-facing Details into the Public section.
- Preserve v1.0.1 embedded artwork support and Undo for partial failures.
- Published through the SBS Environment update catalog.

## 1.0.1 — 2026-10-29

- Extract embedded Artwork pictures and upload them automatically after import confirmation.
- Assign uploaded actor portraits to default token textures; remap matching feature/attack and required Catalog image paths.
- Preview embedded portraits without uploading; upload only referenced selected content.
- Fail visibly before document creation when an image upload fails.
- Retain uploaded files on Undo and preserve existing scene tokens.
- Add artwork extraction, upload failure, path matching and native import regression tests.
- Manual patch build; not published to the update feed.

## 1.0.0 — 2026-10-06

- Promote the tested 0.5.0 build to 1.0.0; retain its runtime behavior and artwork.
- Update build/package labels, matching workbooks and quick-start documentation.
- Add GitHub/Environment installation metadata and repository README entries.
- Record completed live workflow checks and the outstanding player-account GM-note permission check.

Made by **SaltyBananaSlug**.
