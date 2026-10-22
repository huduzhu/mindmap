# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The save badge no longer says "Saved" while a note is still being typed. A note reaches the
  project a moment after you stop typing, so in that moment the badge said "Saved" too early,
  and closing the app then could lose the last words.

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

[Unreleased]: https://github.com/huduzhu/mindmap/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/huduzhu/mindmap/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/huduzhu/mindmap/releases/tag/v1.0.0
