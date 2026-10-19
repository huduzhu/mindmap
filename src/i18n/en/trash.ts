import { registerMessages } from '../index'

/**
 * English text used only by the Trash dialog (H-0). It ships in that lazily
 * loaded chunk, not the startup bundle: every module that uses one of these
 * keys imports this file, which registers the table before the module runs.
 */
export const trashMessages = {
  'trash.title': 'Trash',
  'trash.empty': 'Trash is empty.',
  'trash.restore': 'Restore',
  'trash.deleteForever': 'Delete forever',
  'trash.confirmOne': 'Delete "{name}" forever? This cannot be undone.',
  'trash.autoPurge': 'Delete projects forever after {days} days in the trash',
  'trash.emptyTrash': 'Empty trash',
  'trash.confirmAllOne': 'Delete the project in the trash forever? This cannot be undone.',
  'trash.confirmAll': 'Delete all {count} projects in the trash forever? This cannot be undone.',
} as const

registerMessages(trashMessages)
