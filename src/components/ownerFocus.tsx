import { createContext, useContext, type RefObject } from 'react'

// The tab-stop wrapper that owns the canvas/outliner shortcuts. RenameInput
// returns focus here on commit and cancel (#5) so a rename never strands the
// keyboard chain on <body>.
export const OwnerFocusContext = createContext<RefObject<HTMLElement | null> | null>(null)

export function useOwnerFocusTarget(): RefObject<HTMLElement | null> | null {
  return useContext(OwnerFocusContext)
}
