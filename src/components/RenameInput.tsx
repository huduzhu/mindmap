import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { useEditor } from '../store/editor'

interface RenameInputProps {
  initial: string
  onCommit: (draft: string) => void
  className?: string
  style?: CSSProperties
  autoWidth?: boolean
  onEnter?: () => void
  onCancel?: () => void
  /**
   * Tab / Shift+Tab while typing (#132, Workflowy-style): the text is saved
   * first (unless it is blank), then the caller indents or outdents the row and
   * keeps it in rename mode. Without it Tab moves focus as usual.
   */
  onTab?: (shift: boolean) => void
  /**
   * Ctrl/Cmd+Enter while typing (#148a): the text is saved, then the node is
   * marked done or not done (or made a task). Plain Enter is unchanged.
   */
  onToggleDone?: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

export function RenameInput({
  initial,
  onCommit,
  className,
  style,
  autoWidth,
  onEnter,
  onCancel,
  onTab,
  onToggleDone,
  returnFocusRef,
}: RenameInputProps) {
  const [draft, setDraft] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  const finishedRef = useRef(false)
  // Set while a Tab moves this row (#132). React may move the row's element to
  // its new place, which blurs the input; that blur must not end the rename,
  // and the input takes focus back once the move has rendered.
  const movingRef = useRef(false)

  useLayoutEffect(() => {
    if (!movingRef.current) return
    movingRef.current = false
    const input = inputRef.current
    if (!input || document.activeElement === input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  })

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // One focus-return rule (#5): whichever path unmounts the input — Enter/blur
  // commit or Escape cancel — focus goes back to the shortcut-owning wrapper
  // (returnFocusRef), so a rename never strands focus on <body> and the keyboard
  // chain stays alive. Callers that pass no ref (toolbar, home list) keep their
  // existing behaviour.
  //
  // The rule is "restore focus only if this unmount actually stranded it": we
  // look at where focus *went*, not at whether it was still on the input.
  //   1. StrictMode (dev) re-runs every effect as mount → cleanup → mount. During
  //      that simulated unmount the input is still the active element, so there is
  //      nothing to restore — and yanking focus away would blur the input, firing
  //      onBlur → commit() and silently cancelling the rename. That is the bug that
  //      made F2/Tab/Enter un-renameable on the canvas and the brainstorm outliner
  //      while the outline (which passes no ref) kept working.
  //   2. On a genuine unmount the node is already gone and focus has fallen to
  //      <body>, which is exactly the case worth repairing.
  //   3. If focus moved somewhere deliberate (the user clicked another node), we
  //      leave it alone.
  //
  // Note: React detaches refs *before* running passive effect cleanups, so
  // `inputRef.current` is already null here — the active element has to be compared
  // against <body>, never against the ref.
  useEffect(() => {
    const returnFocusTarget = returnFocusRef?.current ?? null
    return () => {
      const active = document.activeElement
      if (active !== null && active !== document.body) return
      returnFocusTarget?.focus()
    }
  }, [returnFocusRef])

  const commit = () => {
    if (finishedRef.current) return false
    finishedRef.current = true
    onCommit(draft)
    return true
  }

  return (
    <input
      ref={inputRef}
      className={className}
      value={draft}
      style={{
        font: 'inherit',
        color: 'inherit',
        ...(autoWidth ? { width: `${Math.max(4, draft.length + 2)}ch` } : {}),
        ...style,
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (movingRef.current) return
        // Blur and Enter can both fire during the same rename transition. Use the
        // same guarded path for both so a blur cannot commit stale text twice or
        // race the caller's follow-up action (for example, creating the next
        // brainstorm bullet).
        commit()
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Tab' && onTab) {
          e.preventDefault()
          if (finishedRef.current) return
          movingRef.current = true
          // A blank draft is not saved (it would keep the old title anyway); the
          // row still moves and the input stays empty for typing.
          if (draft.trim()) onCommit(draft)
          onTab(e.shiftKey)
          // Nothing re-renders when the row could not move; stop guarding the blur.
          setTimeout(() => {
            movingRef.current = false
          }, 0)
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const toggle = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && onToggleDone
          if (commit()) {
            if (toggle) toggle()
            else onEnter?.()
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          finishedRef.current = true
          const editor = useEditor.getState()
          // A node created just now for naming goes away again (it was never named).
          if (!editor.editing || !editor.discardDraft(editor.editing)) editor.setEditing(null)
          onCancel?.()
        }
      }}
    />
  )
}
