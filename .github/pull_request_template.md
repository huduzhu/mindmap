## What and why

<!-- What does this change, and why? Link the issue it addresses (e.g. "Fixes #12"). -->

## Checklist

- [ ] `npm run lint` passes with no warnings (no lint-disable comments, `@ts-ignore` or `@ts-expect-error`)
- [ ] `npm run format:check` passes
- [ ] `npm run validate:fixtures` passes (needed when schemas, fixtures, presets or examples change)
- [ ] After a schema change: `npm run validators` was run and `src/schema/validators.generated.js` is committed
- [ ] `npm test` passes, and new or changed behaviour has tests
- [ ] `npm run build` and `npm run size` pass (startup JavaScript within the budget)
- [ ] `npm run e2e` passes, with a Playwright test for new user-visible flows
- [ ] New user-visible text is in both English and 简体中文
- [ ] Screenshots or a short recording for UI changes
