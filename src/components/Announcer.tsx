import { useAnnouncer } from '../a11y/announcer'

/** The visually hidden live region behind `announce()` (#85). Mount once at the App root. */
export function Announcer() {
  const message = useAnnouncer((state) => state.message)
  const toggle = useAnnouncer((state) => state.toggle)
  return (
    <div className="visually-hidden" role="status" aria-live="polite" data-testid="announcer">
      {/* A trailing no-break space on alternate messages makes a repeat count as a change. */}
      {message ? `${message}${toggle ? ' ' : ''}` : ''}
    </div>
  )
}
