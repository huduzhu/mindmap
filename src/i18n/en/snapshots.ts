import { registerMessages } from '../index'

/**
 * English text used only by the Snapshots dialog (H-0). It ships in that lazily
 * loaded chunk, not the startup bundle: every module that uses one of these
 * keys imports this file, which registers the table before the module runs.
 */
export const snapshotsMessages = {
  'toolbar.noSnapshots': 'No snapshots saved.',
  'toolbar.restoreSnapshot': 'Restore {name}',
  'toolbar.deleteSnapshot': 'Delete {name}',
  'toast.snapshotRestored': 'Restored snapshot "{name}"',
  'toast.snapshotRestoreFailed': 'Snapshot "{name}" could not be restored',
  'toast.snapshotDeleted': 'Deleted snapshot "{name}"',
  'toast.snapshotDeleteFailed': 'Snapshot "{name}" could not be deleted',
  'snapshots.title': 'Snapshots',
  'snapshots.intro':
    'Named copies of this project you can go back to. Restoring is one step you can undo.',
  'snapshots.meta': '{date} · {nodes}',
  'snapshots.nodes.one': '{count} node',
  'snapshots.nodes.other': '{count} nodes',
  'snapshots.restore': 'Restore',
  'snapshots.rename': 'Rename',
  'snapshots.delete': 'Delete',
  'snapshots.renameLabel': 'Rename {name}',
  'snapshots.renameTitle': 'Rename snapshot',
  'snapshots.renamed': 'Snapshot renamed to "{name}"',
  'snapshots.renameFailed': 'Snapshot "{name}" could not be renamed',
  'snapshots.restoreTitle': 'Restore snapshot',
  'snapshots.confirmRestore':
    'Replace the map and brainstorm with snapshot "{name}"? You can undo this.',
  'snapshots.deleteTitle': 'Delete snapshot',
  'snapshots.confirmDelete': 'Delete snapshot "{name}"? This cannot be undone.',
} as const

registerMessages(snapshotsMessages)
