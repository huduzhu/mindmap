import { create } from 'zustand'
import type { CoeditMode } from './types'

export interface CoeditBadgeState {
  connected: boolean
  reconnecting: boolean
  pendingCount: number
  mode: CoeditMode
  agentName: string | null
  projectId: string | null
}

export const DEFAULT_BADGE_STATE: CoeditBadgeState = {
  connected: false,
  reconnecting: false,
  pendingCount: 0,
  mode: 'read-only',
  agentName: null,
  projectId: null,
}

export const useCoeditBadge = create<CoeditBadgeState>()(() => ({ ...DEFAULT_BADGE_STATE }))
