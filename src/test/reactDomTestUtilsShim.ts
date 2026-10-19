/**
 * Test-only stand-in for `react-dom/test-utils` (#61, D1).
 *
 * `@testing-library/react` imports `act` from `react-dom/test-utils` as a
 * fallback for Reacts without `React.act`. That module is deprecated in React
 * 19, so vite.config.ts aliases it here in test mode. `act` delegates to
 * `React.act` (which @testing-library/react already prefers), with a plain
 * call as the last resort.
 *
 * MMS_TEST_UTILS_SHIM lets src/test/actShim.test.ts prove the alias applies,
 * so if it ever stops applying, a test fails.
 */
import * as React from 'react'

type ActFn = (callback: () => unknown) => unknown

export const MMS_TEST_UTILS_SHIM = true

export const act: ActFn = (React as { act?: ActFn }).act ?? ((callback) => callback())

export default { act, MMS_TEST_UTILS_SHIM }
