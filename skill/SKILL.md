---
name: mindmap-studio
description: >-
  Generate and update Mind Map Studio JSON documents (mind map templates and
  projects). Use when the user asks to create a mind map / brainstorm from a
  topic, or hands over an analysis-request packet (.json) with intent expand,
  convert, or improve produced by the Mind Map Studio app's "Export for AI"
  feature. Requires a checkout of the Mind Map Studio repository (with
  `npm install` done): the mandatory validation gate runs the repo's
  scripts/validate.mjs against its schemas/.
---

# Mind Map Studio skill

You produce JSON documents for **Mind Map Studio**, an offline-first mind-map
app. The app never talks to an LLM at runtime: the user exports a file, you
turn it into another file, the user imports that file back. Your output is
only useful if it **validates against the schemas and imports cleanly**.

## Precondition — run inside the repository

This skill is not self-contained. Its gate (`scripts/validate.mjs`), repair tool
(`scripts/repair-llm-output.mjs`), schemas (`schemas/`), goldens
(`fixtures/golden/`) and presets (`presets/`) live in the Mind Map Studio
repository, outside `skill/`. Before starting any workflow, confirm you are at
the repository root:

```sh
test -f scripts/validate.mjs && test -d schemas && echo OK   # sh
```

```powershell
Test-Path scripts/validate.mjs, schemas   # PowerShell: both must print True
```

If `scripts/validate.mjs` or `schemas/` is missing, **stop** and tell the user
that the skill must be run from a checkout of the repository (clone it and run
`npm install`). Do not produce an unvalidated file instead.

## Workflow routing

Read the input and pick exactly one workflow:

| Input | Workflow | Return document |
|---|---|---|
| A free-form topic / prompt from the user | **generate** | `template.json` (preferred) or `project.json` |
| Packet JSON with `"intent": "expand"` | **expand** | `brainstorm-update.json` |
| Packet JSON with `"intent": "convert"` | **convert** | `template.json` |
| Packet JSON with `"intent": "improve"` | **improve** | full `project.json` |

A packet is a document with `"kind": "analysis-request"`. Its
`instructions.goal`, `instructions.rules`, and `returnContract` fields are the
primary brief — follow them. This skill supplies the invariants below, which
the packet relies on but does not always restate.

## Invariants (all workflows)

1. **Validate before handoff — mandatory.** From the repo root run:

   ```sh
   node scripts/validate.mjs <your-output.json>
   ```

   (same as `npm run validate`). If it prints `FAIL`, fix the document and
   re-run until it prints `PASS`. Never hand over an unvalidated file.

   If the only complaints are missing wrapper fields (`schemaVersion`, `name`,
   `preset`), you do not have to reconstruct them by hand — run:

   ```sh
   node scripts/repair-llm-output.mjs <your-output.json>
   ```

   It fills exactly the fields the app's importer would fill, prints which ones
   it added, and re-validates. Everything else it reports is yours to fix in the
   document. Use `--strict` to see what is missing *without* filling, which is
   the honest check when you want to know whether you drifted.
2. **Closed role set.** The only allowed values of `role` are:
   `theme`, `main-branch`, `branch`, `leaf`, `task`, `idea`, `question`, `risk`.
   See `references/roles.md` for when to use each.
3. **No coordinates.** Nodes never carry x/y/position fields — the app lays
   everything out on import. Schema-wise extra properties are rejected.
4. **Size limits.** Titles ≤ 500 chars (project/template names ≤ 200), notes ≤ 20000 chars, ids 1–64 chars,
   ≤ 1000 children per node, ≤ 500 nodes total is a good comfort zone.
5. **Stable ids.** Node ids are opaque strings; treat existing ids as
   immutable tokens unless a workflow explicitly says otherwise.
6. **One file, one document.** Return a single top-level JSON document. Put
   commentary in your reply text, never inside the JSON (schemas use
   `additionalProperties: false`).
7. **Preset.** Copy the preset from the input (packet `preset` field, or the
   source project). Built-in names: `default`, `corporate`, `dark`, `handdrawn`,
   `colorblind-safe`, and `system` (follows the device's light/dark setting). Only use
   an inline `{ "inline": { ... } }` preset object when the user explicitly
   provided custom style definitions.
8. Golden samples live in `fixtures/golden/` — one per workflow. Match their
   shape and level of care. Document shapes are summarized in
   `references/schemas.md`; conventions and failure modes in
   `references/conventions.md`.

## generate — topic → new template

The user names a topic (and optionally a tone, audience, or preset). Build a
`template` document:

- `kind: "template"`, `schemaVersion: 1`, `name` = short title for the map.
- `root` is the theme node: `role: "theme"`, title = topic.
- 3–6 first-level branches, `role: "main-branch"`, with explicit `side`
  alternating `"left"` / `"right"` so the map balances.
- 2–4 leaves per branch (`role: "leaf"`, or `idea` / `task` / `question` /
  `risk` where the meaning fits). Keep titles short and concrete.
- Every node needs an `id`: short, unique, human-readable slugs
  (`launch-pricing`) or `x-` + random token. Never reuse an id twice.
- Prefer `template` over `project`: the app wraps templates with a fresh
  brainstorm section on import.

## expand — grow the brainstorm (append-only)

Input packet: `payload.brainstorm` is the existing idea list, and `projectId`
names the source project. Return a **brainstorm-update** document:

- `kind: "brainstorm-update"`, `schemaVersion: 1`.
- `sourceProjectId` = the packet's `projectId` (copy it exactly).
- `name` = packet `projectName`, `preset` = packet `preset`.
- `brainstorm` = the packet's brainstorm tree **plus new children**.
  - Keep every existing node byte-for-byte: same id, title, notes, order.
    Never delete, rename, re-parent, or reorder existing nodes — the app
    compares against its copy and reports any breach to the user.
  - New nodes get **fresh ids** and attach under the most relevant existing
    node, 2–5 per target branch unless the packet says otherwise.
- **There is no `map` field.** The schema rejects it. The app keeps the
  source project's mind map itself: by default it merges your brainstorm into
  the source project (the user can choose a new "<project name> (expanded)"
  copy instead). If the source has no mind map yet, the app offers an offline
  "Copy brainstorm to map" and the **convert** workflow — you do not need to
  cover for that.
- Respect the packet's `depth`: at `titles` depth you received no notes, so do
  not invent notes for existing nodes (new nodes may carry notes only when
  they add real substance).

## convert — brainstorm → mind map

Input packet: `payload.brainstorm` is the source material. Return a
**template** document whose `root` is the new mind map:

- `sourceProjectId` = the packet's `projectId` (copy it exactly). The app then
  offers to put your map into that project, keeping its brainstorm.
- `name` = packet `projectName`, `preset` = packet `preset`.
- `root.role` = `theme`, title = the brainstorm root title.
- Cluster related brainstorm items under main branches; do not mirror the
  bullet list blindly. Keep titles short.
- First-level branches: `role: "main-branch"` + explicit `side` (`"left"` /
  `"right"`), alternating to balance the layout.
- Deeper nodes: `role` from the closed set (`branch`, `leaf`, `task`, `idea`,
  `question`, `risk`) assigned by meaning.
- Never return or modify the brainstorm tree — the template's `root` is the
  map and nothing else. When applied, the app keeps the project's brainstorm
  untouched and replaces only its map.

## improve — sharpen an existing project

Input packet: `payload.brainstorm` and `payload.map`. Return a full
**project** document with both trees:

- `sourceProjectId` = the packet's `projectId` (copy it exactly), so the app
  can update that project instead of adding a copy.
- Preserve every node id that survives. Rewriting titles and notes and
  re-parenting nodes is allowed when it clearly helps; removing ideas is not,
  unless two nodes are exact duplicates.
- Keep `name` and `preset` from the packet. The overall shape should stay
  recognizable — this is an edit, not a rewrite.
- Summarize what you changed in the reply text, separate from the JSON.

## Handoff checklist (every workflow)

1. Output written to `out/llm/<name>.json` (or the path the user gave).
2. `node scripts/validate.mjs out/llm/<name>.json` → `PASS`. If it reports only
   missing wrapper fields, `node scripts/repair-llm-output.mjs out/llm/<name>.json`
   fills them and prints the path it wrote; hand over **that** file (or re-run
   with `--in-place` to fix the original). Never hand over a file that still
   prints `FAIL`.
3. Reply tells the user the exact file path and that they can import it via
   the app's **Import** button or drag-and-drop (imports always land as a new
   copy — the original project is never overwritten).
