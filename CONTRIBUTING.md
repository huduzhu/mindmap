# Contributing to Mind Map Studio

Thanks for your interest! Bug reports, ideas and pull requests are all welcome. Please open an
issue with one of the templates before starting a larger change, so we can agree on the approach
first.

## Development setup

You need Node.js 24 (see `.nvmrc`) and git.

```bash
npm ci             # install exact dependency versions
npm start          # dev server on http://localhost:5173; npm stop stops it
npm run e2e:install  # once: download Chromium for the browser tests
```

`npm stop` looks up the process listening on the dev server's port. On macOS and Linux it uses
`lsof`, so install that if your system lacks it (e.g. `sudo apt install lsof`).

The app is React 19 + TypeScript + Vite, with zustand for state, React Flow for the canvas and
IndexedDB for storage. There is no server; everything runs in the browser.

## Before you open a pull request

CI runs these on every push and pull request, and all of them must pass:

| Check | Command |
|---|---|
| Lint (no warnings allowed) | `npm run lint` |
| Formatting | `npm run format:check` (fix with `npm run format`) |
| Schemas, fixtures, presets, examples | `npm run validate:fixtures` |
| Precompiled validators match the schemas | `npm test` fails if they are stale; regenerate with `npm run validators` |
| Unit and component tests | `npm test` |
| Type-check and production build | `npm run build` |
| Startup JavaScript budget (575 KB) | `npm run size` (after a build) |
| Dependency audit | `npm audit --audit-level=high` |
| Browser tests | `npm run e2e` |

## Standards

- **Lint with oxlint, no suppressions.** `npm run lint` runs `oxlint --deny-warnings`. Fix the
  code rather than adding `eslint-disable`/`oxlint-disable` comments, `@ts-ignore` or
  `@ts-expect-error`. Lint enforces the rules of hooks and that component files export only
  components.
- **React review rules.** Lint does not catch these, so reviews check them: no `setState` inside
  effects, and no reading or writing `ref.current` during render.
- **Test what you change.** Add or update unit tests next to the code (`*.test.ts(x)`, Vitest +
  Testing Library), and a Playwright test in `e2e/` for user-visible flows.
- **Every string in both languages.** User-visible text goes through `t()` with keys in
  `src/i18n/en.ts` (or an area file in `src/i18n/en/` for text used only by lazily loaded parts)
  and `src/i18n/zh-CN.ts`. `src/i18n/noEnglish.test.tsx` checks that no English is left in the
  Chinese interface.
- **Keep startup lean.** Dialogs and large features load on demand (see
  `src/components/lazyDialogs.tsx`); `npm run size` fails above the budget.
- **Accessibility.** Everything must work from the keyboard, with visible focus, and announce
  edits to screen readers.
- **File format.** Project files are checked against the JSON Schemas in `schemas/`. A new
  optional field needs a schema change, a fixture in `fixtures/valid/`, and a higher
  `requiredFormatVersion` (`src/schema/formatVersion.ts`), so older versions of the app report
  such files instead of changing them. After changing a schema, run `npm run validators` to
  regenerate the precompiled validators (`src/schema/validators.generated.js`) and commit them;
  a test fails while that file is out of date.
- **Never lose user data.** Changes to saving, sync, import or the Trash need tests for the
  failure paths too.

## Commits and pull requests

- Keep commits focused and describe what changed and why in the message.
- One topic per pull request; link the issue it addresses.
- Screenshots or a short recording help for UI changes.
- `main` only moves forward: every change lands through a pull request with green CI, and its
  history is never rewritten or force-pushed. Forks, clones and open pull requests all build on
  it.

## Releasing

1. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new version heading with today's
   date, and set the same `version` in `package.json` (`npm version <x.y.z> --no-git-tag-version`
   updates `package-lock.json` too). Fixes are a patch release (1.0.1), new features a minor one
   (1.1.0).
2. Merge that through a pull request, then tag the merge commit on `main`: `git tag v1.0.1 &&
   git push origin v1.0.1`.
3. Run `npm run package` and publish a GitHub release for the tag with the archives from
   `release/`. Publishing the release deploys that tag to GitHub Pages.

A published tag is never moved or deleted; a mistake in a release is fixed by the next one.

## Repository settings

These live in the GitHub settings rather than in the code, so they are listed here:

- **Settings → Pages:** Source is **GitHub Actions** (the Pages workflow deploys).
- **Settings → Environments → github-pages → Deployment branches and tags:** besides `main`,
  allow tags matching `v*`, since a release deploys from its tag.
- **Settings → Rules → Rulesets → New ruleset → Import a ruleset:** import both files in
  `.github/rulesets/`. `main.json` blocks force pushes and deletion of `main` and requires a
  pull request with the `gates` and `e2e` checks passing; `release-tags.json` stops `v*` tags
  from being moved or deleted.
- **Settings → General → Pull Requests:** "Automatically delete head branches" is on.
- **Settings → Advanced Security:** private vulnerability reporting, Dependabot alerts and
  security updates, and secret scanning with push protection are on.

## Reporting security issues

Please don't open a public issue for a security problem. Use GitHub's **Report a vulnerability**
(private security advisory) on this repository instead.

## License

By contributing you agree that your contributions are licensed under the MIT License, like the
rest of the project.
