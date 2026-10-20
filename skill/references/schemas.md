# Document shapes (schemaVersion 1)

Source of truth: `schemas/*.schema.json` (JSON Schema 2020-12, validated with
`node scripts/validate.mjs <file>`). Every document is a single JSON object
with `additionalProperties: false` — unknown fields are rejected.

## Shared: tree node

```jsonc
{
  "id": "launch-ideas",        // string, 1..64 chars, unique per document
  "title": "Launch ideas",      // string, ≤ 200 chars (≤ 500 schema cap, app prefers 200)
  "notes": "optional markdown", // ≤ 20000 chars
  "side": "left",               // only on first-level map branches: left | right | auto
  "role": "main-branch",        // closed set — see roles.md
  "collapsed": false,           // optional UI hint; omit unless asked
  "done": true,                 // optional: a finished task (role "task" only)
  "color": 3,                   // optional: integer 1..8, a colour of the preset's palette
  "icon": "🔥",                 // optional: exactly one emoji, shown before the title
  "tags": ["p1", "backend"],    // optional: ≤ 10 node tags, lowercase, no "#", 1..32 of letters, digits, - _ /
  "image": { "asset": "sha256-…", "w": 800, "h": 600, "alt": "Whiteboard" }, // optional: an embedded picture (app-made only)
  "children": [ /* tree nodes, max 1000 */ ]
}
```

- Only `id` and `title` are required. Omit optional fields rather than
  emitting `null` or empty strings.
- Ids must be unique across the **entire document** (both trees of a project
  combined). The app repairs duplicates on import, but repaired ids break
  later round-trips — don't rely on it.
- Keep `done`, `color`, `icon`, `tags` and `image` exactly as given on the nodes that have them. Set `"done": true`
  only on a node with `role: "task"` that is clearly finished; otherwise omit it.
- Never invent `x`, `y`, `position`, `style`, hex colours, an `image`, or any field not
  listed above. `color` is a palette slot number, never a colour value.

## template (`kind: "template"`)

Returned by **convert** and **generate**.

- **convert**: set `sourceProjectId` to the packet's `projectId`. On import the
  app offers to put this map into that project (replacing its map, keeping its
  brainstorm, one undo step) — the default — or to import a separate project.
- **generate** (no packet, no `sourceProjectId`): imported as a *new project*;
  the app wraps it with a fresh, empty brainstorm section.

```jsonc
{
  "kind": "template",
  "schemaVersion": 1,
  "sourceProjectId": "p-launch-1", // convert only: copy from the packet's projectId
  "name": "Weekly Review",      // ≤ 200 chars
  "preset": "dark",             // preset name (string) or { "inline": {...} }
  "root": { /* tree node — the mind map */ }
}
```

## project (`kind: "project"`)

Returned by **improve**. Contains both sections. Set `sourceProjectId` to the
packet's `projectId`: on import the app offers to update that project with both
trees (one undo step) — the default — or to import a copy.

```jsonc
{
  "kind": "project",
  "schemaVersion": 1,
  "sourceProjectId": "p-launch-1", // improve: copy from the packet's projectId
  "name": "Product Launch",
  "preset": "corporate",
  "brainstorm": { /* tree node — outliner section */ },
  "map": { /* tree node — mind map section */ },
  "links": [ { "from": "n-a", "to": "n-b", "label": "depends on" } ], // optional cross-links between map node ids; label ≤ 80 chars, optional
  "updatedAt": "2026-09-01T00:00:00Z" // optional ISO string; omit in output
}
```

Both `brainstorm` and `map` are required. **expand** no longer returns this
shape — it returns a `brainstorm-update` (below), which has no map field.

## brainstorm-update (`kind: "brainstorm-update"`)

Returned by **expand**. On import the app finds the source project by
`sourceProjectId`, shows the user what the update adds, and by default merges
it into that project's brainstorm (its mind map is untouched); the user can
instead import it as a new copy named "<name> (expanded)".

```jsonc
{
  "kind": "brainstorm-update",
  "schemaVersion": 1,
  "sourceProjectId": "p-launch-1",    // copy from the packet's projectId
  "name": "Launch ideas",             // packet projectName
  "preset": "default",
  "brainstorm": { /* tree node — the expanded brainstorm, original ids intact */ }
}
```

There is **no `map` field** — the schema rejects extra properties, so do not
emit one. Append-only: every node from the packet's `payload.brainstorm` must
reappear with the same id, title, notes, and order.

## analysis-request (`kind: "analysis-request"`) — input only

The packet the app exports via **Export ▾ → For AI…**. You consume it, never emit it.

```jsonc
{
  "kind": "analysis-request",
  "schemaVersion": 1,
  "projectName": "Launch ideas",
  "projectId": "p-launch-1",        // optional; id of the exporting project
  "intent": "expand",             // expand | convert | improve
  "depth": "titles",              // titles = notes stripped | full
  "preset": "default",            // preset to carry into the output
  "payload": {
    "brainstorm": { /* always present */ },
    "map": { /* only for improve */ }
  },
  "instructions": { "goal": "...", "rules": ["..."] },
  "returnContract": "..."
}
```

Routing: `intent` selects the workflow; `instructions` + `returnContract`
are the brief; `preset` and `projectName` are copied into the output. For
**expand**, **convert** and **improve**, copy `projectId` into the reply's
`sourceProjectId` — that is how the app puts the reply back into the right
project.

## Preset reference

- String form (usual): `"default"`, `"corporate"`, `"dark"`, `"handdrawn"`,
  `"colorblind-safe"`, or `"system"` (the app's default for new projects: `dark` or
  `default` following the device's light/dark setting). If the app does
  not have the named preset installed, it falls back to `default` with a
  warning — so only use names the user mentioned or the built-ins.
- Inline form (rare, user-supplied styles only):
  `{ "inline": { /* full preset document, see presets/*.json */ } }`.
