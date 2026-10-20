import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

test('app boots to the start screen', async () => {
  render(<App />)
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Mind Map Studio' })).toBeInTheDocument()
  })
  expect(screen.getByRole('button', { name: /start a new project/i })).toBeInTheDocument()
})
