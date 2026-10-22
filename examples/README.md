# Example import files

Drop any of these into the studio (Import button, or drag-and-drop anywhere on
the page) to exercise every import path. All JSON files validate against the
schemas in `schemas/` (`node scripts/validate.mjs examples/*.json` passes on every
platform — the script expands the wildcard itself — and `npm run validate:fixtures`
checks them in CI).

| File | Kind | What it shows |
|---|---|---|
| `getting-started.json` | `project` | The bilingual (English/中文) guide behind **Try the guide** on the start screen: every shortcut as a node, notes with Markdown, a folded branch to open, tasks with a progress count, a colour and emoji marker, and a labelled link. The app bundles this file, so edits here change the guide. |
| `project-product-roadmap.json` | `project` | Full project: roles, notes, sides, a collapsed branch, and a non-default preset (`handdrawn`). Lands as a new project. |
| `template-meeting-prep.json` | `template` | Map-only template with balanced left/right sides. Lands as a new project with a fresh brainstorm root. |
| `brainstorm-update-product-launch.json` | `brainstorm-update` | Append-only expansion of a brainstorm (all existing ids/titles kept, new bullets added). When its source project is in the library, the app previews the new bullets and merges them into that project (or, if chosen, adds an "(expanded)" copy). |
| `outline-team-retro.md` | Markdown | Indented-bullet outline (`# heading` becomes the project name). Lands as a new project with the bullets in the brainstorm section. |

## Note on the brainstorm-update example

A `brainstorm-update` always applies to the project whose library id is in its
`sourceProjectId`. This file targets the "Product Launch" project in the
library it was authored against (id `VpDCweylBz`). If that project is not in
your library, it is imported as a new project instead, with a note saying so.
To author your own update,
use **Export ▾ → For AI…** in the app and pick **expand**: the packet carries your
`projectId`, and the returned file's `sourceProjectId` must copy it exactly.
