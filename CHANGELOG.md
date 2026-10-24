# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.5] - 2026-10-24

### Fixed

- **Map layout**: a node taller than the one above it (for example one with a picture, or a long
  wrapped title) no longer overlaps that node and takes its clicks; siblings are always evenly
  spaced, and a parent now lines up with its child so the connecting line stays straight.

### Changed

- GitHub Actions are pinned to exact commit SHAs, and the code is type-checked with stricter
  TypeScript settings (`exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess` for app code).
- Updated development dependencies: `fast-uri` 3.1.9, `serialize-javascript` 7.1.4.

## [1.0.4] - 2026-10-24

### Added

- A browser test of the installed app offline: the service worker caches every file of the
  build, and a map made and edited with the network off is still there after an offline reload.

### Fixed

- **Copy, paste and brainstorm-to-map**: copying and pasting nodes with the keyboard (`Ctrl+C`
  or `Ctrl+X`, then `Ctrl+V`) and copying Brainstorm bullets into the map now keep node tags and
  pictures; over-long pasted titles and notes are cut without splitting an emoji; and appending
  brainstorm bullets past the 1,000-branch limit is refused with a clear message.
- **Notes drafts and autosave**: a note still being typed is committed before switching projects,
  going Home, taking or restoring a snapshot, duplicating, moving to the Trash or downloading a
  backup, and never lands in the project opened next; autosave now writes at least every 5
  seconds during continuous typing.
- **Folder sync, thumbnails and Trash**: moving a synced file to `_trash` no longer overwrites an
  existing file there when a lookup fails; a OneDrive duplicate identical to the project file is
  moved aside without making a conflict copy; a thumbnail whose picture arrived while it was
  loading no longer stays stuck on "not available"; renaming, pinning or tagging a trashed
  project no longer quietly restores it from the Trash; pinning updates other open tabs; and
  restoring a snapshot applies changes that only touch cross-link labels.
- **Translation, keyboard and accessibility**: the toast for a damaged stored project is now
  translated, and duplicated projects use the current language's copy suffix (`(copy)` /
  `（副本）`); the command palette, link picker and tag suggestions scroll the highlighted
  option into view as you arrow through them; Chinese input in the tag field and custom-emoji
  box no longer submits early on `Enter`; clicking a cross-link opens folded branches, leaves
  branch focus and switches a hiding tag filter to highlight so the target is shown; `Esc` in
  the preset editor returns to the preset list and restores focus; toolbar and node menus stay
  inside short or narrow screens, and the node menu closes when you pan or zoom and blocks map
  shortcuts while focused; `Ctrl+Alt+Z`/`Y` (`AltGr`) no longer undo or redo; and Windows
  high-contrast mode outlines active options, the current preset and the active filter mode.
- **Import, export, ZIP and HTML viewer**: corrupt compressed ZIP entries report a checksum
  error instead of a blank message, truncated central-directory names are refused, and malformed
  preset or snapshot entries in a backup manifest are skipped without failing a restore whose
  projects were already stored; lone carriage returns in titles or notes and untitled child
  nodes survive a Markdown round trip; branch import refuses newer format versions and drops
  invalid markers like full import; PNG/SVG export and print frame the focused and tag-filtered
  branch shown on screen; and the interactive HTML viewer shows the `✎` notes marker, closes the
  notes card on `Esc` and closes an enlarged picture when `F5` starts presentation mode.
- The Content-Security-Policy browser test no longer fails now and then on CI: it reloaded the
  page before the autosave had landed, which dropped the node it had just added.

## [1.0.3] - 2026-10-23

### Changed

- Updated Vitest, the unit-test runner, to version 5; Dependabot now offers its major updates
  too.
- Updated vite-plugin-pwa, which builds the service worker, to version 2. The built app,
  service worker included, is unchanged.
- Updated TypeScript to 7, the native compiler: type-checking the project (`tsc -b`, part of
  `npm run build`) takes about 2 seconds instead of 15. No code changes were needed.

## [1.0.2] - 2026-10-22

### Fixed

- The save badge no longer says "Saved" while a note is still being typed. A note reaches the
  project a moment after you stop typing, so in that moment the badge said "Saved" too early,
  and closing the app then could lose the last words.

### Changed

- The start screen appears sooner: the map canvas (with React Flow) is no longer part of the
  JavaScript the app needs before it can start, which drops by about 225 KB. It is fetched
  straight away alongside it, so a project still opens in the map without waiting.
- Updated React and React DOM to 19.3.1 (and their types to 19.3.0), which had been held at
  19.2.x while the startup bundle was near its budget. React 19.3 adds about 28 KB, so startup
  JavaScript is now about 373 KB of the 575 KB budget. Also updated oxlint to 1.89.
- Dependabot proposes React minor updates again, and the packaging test also runs on Windows.

## [1.0.1] - 2026-10-22

### Fixed

- `npm run package`, which builds the release archives, failed to start: the ZIP writer it
  loads under plain Node had begun importing the app's translations. A test now runs it the
  same way.

### Changed

- Updated minor and patch dependencies (Vite 8.3, React Flow 12.12, Playwright 1.64, oxlint,
  Prettier, jsdom, Vitest 4.1.12 and others); React stays on 19.2.x.
- Publishing a GitHub release now deploys it to GitHub Pages.
- CI runs on pushes to `main` and version tags and on pull requests, no longer twice for a
  pull request's branch.
- Documented the release process and the repository settings in `CONTRIBUTING.md`, with
  importable rulesets in `.github/rulesets/`.

## [1.0.0] - 2026-10-20

The first public release.

### Added

- **Three views of one project**: a mind-map canvas with automatic layout, branches on both
  sides, folding, drag to move or re-parent, cross-links, a minimap and zoom; a Brainstorm
  outliner that copies into the map; an Outline view of the map and a split view.
- **Focus on one branch** with a breadcrumb bar, and export of a single branch.
- **Rich nodes**: Markdown notes in a details panel, roles (theme, task, risk, question …),
  tasks with checkboxes and progress, colour and emoji markers, labelled cross-links, tags with
  a filter and tag search, and pictures (paste or drop) stored once and scaled down.
- **Present mode** (`F5`): a full-screen walk through the map, one node at a time; exported
  HTML pages can present too.
- **Keyboard first**: a command palette (`Ctrl+K`), search across all nodes (`Ctrl+F`) and
  keyboard access to every dialog and menu; touch editing on phones and tablets.
- **Safe with your data**: autosave to the browser, persistent undo, named snapshots, a Trash
  with 30-day auto-delete, whole-library backup and restore as one ZIP, a storage meter, and
  protection against two tabs overwriting each other.
- **Sync and share**: sync between computers through a synced folder (e.g. OneDrive) in Chrome
  or Edge; GitHub milestones in a private repository; import of project JSON, Markdown and
  text outlines and ZIPs; export to project JSON, Markdown, OPML, FreeMind, PNG, SVG, a
  self-contained interactive HTML page and ZIPs with images; print or save as PDF.
- **AI round trip without an API key**: export an analysis-request packet for any AI assistant
  and import the JSON it returns to expand ideas or convert a brainstorm into a map, with JSON
  Schemas, examples and an assistant skill in the repository.
- **Looks and languages**: style presets including one that follows the system's light or dark
  setting, a preset editor with a contrast check, and an English and Simplified Chinese
  interface.
- **Accessibility**: screen-reader announcements for edits, labelled nodes and rows, and
  visible keyboard focus.
- **Installable PWA** that works offline and updates when you choose; a Content-Security-Policy
  in the production build and ready-made security headers for static hosts; the hosted app on
  GitHub Pages.

### Security

- The Content-Security-Policy does not allow `'unsafe-eval'`: the JSON schemas are precompiled
  at build time.
- The app refuses to run inside another site's frame.
- On a shared `*.github.io` address the app warns that other sites there can read its storage,
  and does not remember the GitHub token unless you ask it to.
- The interactive HTML export contains only the map, not the Brainstorm tree, and carries its
  own Content-Security-Policy, so the page cannot load or send anything.
- PNG, SVG and print exports do not carry the notes text in hidden tooltips.
- Imported, restored, synced and GitHub files nested deeper than 1,000 levels are refused
  instead of freezing the tab.

[Unreleased]: https://github.com/huduzhu/mindmap/compare/v1.0.5...HEAD
[1.0.5]: https://github.com/huduzhu/mindmap/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/huduzhu/mindmap/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/huduzhu/mindmap/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/huduzhu/mindmap/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/huduzhu/mindmap/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/huduzhu/mindmap/releases/tag/v1.0.0
