import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PromptHost } from './PromptDialog'
import { askText, nameProblem } from './promptStore'

function Harness({ onAnswer }: { onAnswer: (value: string | null) => void }) {
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void askText({
            title: 'Name it',
            label: 'Name',
            initial: 'Draft',
            validate: nameProblem,
          }).then(onAnswer)
        }
      >
        Open
      </button>
      <PromptHost />
    </>
  )
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('PromptDialog (#77)', () => {
  it('focuses and selects the prefilled field; Enter answers with the text', async () => {
    const answers: (string | null)[] = []
    render(<Harness onAnswer={(value) => answers.push(value)} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Name it' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' })
    expect(input).toHaveFocus()
    expect(input.value).toBe('Draft')

    fireEvent.change(input, { target: { value: 'Final' } })
    fireEvent.submit(input.form!)
    await flush()
    expect(answers).toEqual(['Final'])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('Escape and Cancel answer null', async () => {
    const answers: (string | null)[] = []
    render(<Harness onAnswer={(value) => answers.push(value)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await flush()
    expect(answers).toEqual([null, null])
  })

  it('keeps the dialog open and says why while the value is invalid', async () => {
    const answers: (string | null)[] = []
    render(<Harness onAnswer={(value) => answers.push(value)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(screen.getByRole('alert')).toHaveTextContent('')

    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.')
    expect(input).toHaveAccessibleDescription('Enter a name.')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await flush()
    expect(answers).toEqual([])
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'Fine' } })
    expect(screen.getByRole('alert')).toHaveTextContent('')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await flush()
    expect(answers).toEqual(['Fine'])
  })

  it('a second request cancels the first', async () => {
    const first = askText({ title: 'One', label: 'A' })
    const second = askText({ title: 'Two', label: 'B' })
    render(<PromptHost />)
    expect(await first).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Two' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await second).toBeNull()
  })
})

describe('nameProblem', () => {
  it('applies the 1–200 character rule to the trimmed name', () => {
    expect(nameProblem('ok')).toBeNull()
    expect(nameProblem('  ')).toBe('Enter a name.')
    expect(nameProblem(` ${'x'.repeat(200)} `)).toBeNull()
    expect(nameProblem('x'.repeat(201))).toBe('Use at most 200 characters (now 201).')
  })
})
