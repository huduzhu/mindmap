# Conventions & common failure modes

Few-shot guidance distilled from the golden samples in `fixtures/golden/`.

## Id discipline

```jsonc
// GOOD — existing ids untouched, new node gets a fresh id
{ "id": "b-1", "title": "Landing page before beta ends",
  "children": [ { "id": "x-k4w9t2", "title": "Hero screenshot A/B test" } ] }

// BAD — renamed an existing node's id (breaks round-trips)
{ "id": "b-1-landing", "title": "Landing page before beta ends" }

// BAD — id reused twice in one document
{ "id": "b-1", ... }, { "id": "b-1", ... }
```

Fresh ids: short slugs or `x-` + 6 random chars. 1–64 characters.

## Titles and notes

- Titles are short labels, not sentences: `"Press kit for tech blogs"`, not
  `"We should prepare a press kit that we send to tech blogs"`.
- At `depth: "titles"` the packet had no notes — adding notes to *existing*
  nodes pretends knowledge you don't have. New nodes may carry notes.
- Notes, when used, are plain text or light markdown, ≤ 20000 chars.

## Map shape

```jsonc
// GOOD — balanced first level, semantic roles, no coordinates
{ "id": "t-root", "title": "Launch ideas", "role": "theme", "children": [
  { "id": "t-promo", "title": "Promotion", "role": "main-branch", "side": "right",
    "children": [ { "id": "t-m1", "title": "Press kit", "role": "task" } ] },
  { "id": "t-event", "title": "Launch event", "role": "main-branch", "side": "left",
    "children": [ { "id": "t-q1", "title": "Livestream or recorded?", "role": "question" } ] }
]}

// BAD — invented coordinates, and a colour value where a palette slot (1–8) belongs
{ "id": "t-m1", "title": "Press kit", "x": 240, "y": 80, "color": "#f00" }

// BAD — side only matters on first-level branches
{ "id": "t-q1", "title": "...", "role": "leaf", "side": "left" }
```

## What the validator catches (real rejections)

- `kind` missing or not one of `preset | project | template | analysis-request`
- `role: "topic"` — outside the closed set (`fixtures/invalid/bad-role.json`)
- `"branchColors": ["red"]` — not a `#rrggbb` hex (`fixtures/invalid/bad-hex.json`)
- Any field the schema does not define (`additionalProperties: false`)
- Missing required fields, e.g. a template without `root`

## Workflow etiquette

- **expand**: output = input brainstorm + additions. A diff should show only
  added lines. The return document is a `brainstorm-update` — it has no `map`
  field at all; the app keeps the source project's map itself.
- **convert**: clustering beats mirroring — 5 shallow branches with leaves
  read better than one chain of 8 nodes.
- **improve**: keep ids stable for everything that survives; describe edits
  in the reply text, not inside the JSON.
- Always copy `name` from `projectName` and `preset` from the packet.
- Output goes to `out/llm/` (gitignored), then:
  `node scripts/validate.mjs out/llm/<file>.json` → must print `PASS`.
