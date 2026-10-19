import { registerMessages } from '../index'

/**
 * English text used only by the presentation stage (#152, H-0 area). It ships
 * in the lazily loaded presentation chunk, not the startup bundle.
 */
export const presentMessages = {
  'present.label': 'Presenting {title}',
  'present.step': 'Step {n} of {total}: {title}',
  'present.stepUnder': 'Step {n} of {total}: {title}, under {parent}',
  'present.notesSpoken': 'Notes: {notes}',
  'present.counter': '{n} / {total}',
  'present.goTo': 'Go to {n}',
  'present.progress': 'Progress',
  'present.previous': 'Previous step',
  'present.next': 'Next step',
  'present.exit': 'Leave the presentation (Esc)',
  'present.blanked': 'Screen blanked. Press B to show it again.',
  'present.controls': 'Presentation controls',
  'present.done': 'Done: {title}',
  'present.notDone': 'Not done: {title}',
  'present.tasks': '{done} of {total} tasks done',
} as const

registerMessages(presentMessages)
