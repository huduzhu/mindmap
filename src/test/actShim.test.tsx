// Tripwire for the test-utils shim (#61, D2). If the alias in vite.config.ts
// stops applying, the first test fails instead of the suite silently running
// against the deprecated module.
import { act, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import * as TestUtils from 'react-dom/test-utils'
import { describe, expect, it } from 'vitest'

describe('react-dom/test-utils shim', () => {
  it('resolves to the local shim', () => {
    expect((TestUtils as unknown as Record<string, unknown>).MMS_TEST_UTILS_SHIM).toBe(true)
  })

  it('lets @testing-library act flush a state update', () => {
    let bump: () => void = () => {}
    function Counter() {
      const [count, setCount] = useState(0)
      useEffect(() => {
        bump = () => setCount((value) => value + 1)
      })
      return <span data-testid="count">{count}</span>
    }
    render(<Counter />)
    act(() => bump())
    expect(screen.getByTestId('count').textContent).toBe('1')
  })
})
