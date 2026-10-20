# Role vocabulary (closed set)

The `role` field drives node styling through presets. Only these eight
values are valid — anything else fails validation:

| Role | Meaning | Typical position |
|---|---|---|
| `theme` | The central topic of the map | Root node only |
| `main-branch` | First-level branch off the theme | Depth 1 of the map tree, with explicit `side` |
| `branch` | A grouping node below a main branch | Mid-depth map nodes |
| `leaf` | Plain content node with no strong semantics | Any depth |
| `task` | An actionable item ("Ship v1.2") | Any depth |
| `idea` | A speculative or creative suggestion | Any depth |
| `question` | An open question ("Pricing tier?") | Any depth |
| `risk` | A risk or blocker ("CI flaky on Windows") | Any depth |

## Assignment rules

- The map root is always `theme`; a document has exactly one `theme`.
- Every first-level child of the theme is `main-branch` with `side` set to
  `"left"` or `"right"`, alternating to balance the map.
- Assign semantic roles (`task`, `idea`, `question`, `risk`) whenever the
  wording of the title makes the intent clear; fall back to `branch` for
  groupers and `leaf` for plain content.
- Brainstorm nodes normally carry no role (the outliner is unstyled). Only
  add roles there when reusing nodes from an existing styled tree.
- Omitting `role` is valid; emitting an unknown value is not.
