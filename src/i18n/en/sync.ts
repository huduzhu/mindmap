import { registerMessages } from '../index'

/**
 * English text used only by the Sync folder dialog and the sync controller
 * (#107, H-0). It ships in that lazily loaded chunk, not the startup bundle:
 * every module that uses one of these keys imports this file, which registers
 * the table before the module runs.
 */
export const syncMessages = {
  'sync.title': 'Sync folder',
  'sync.unsupported':
    'Folder sync needs Chrome or Microsoft Edge on a computer. In this browser your projects stay in the browser as before.',
  'sync.intro':
    'Keep a copy of every project as a file in a folder you choose. Pick a folder inside OneDrive and the OneDrive app copies it to your other computers; this app picks up their changes too.',
  'sync.step1': 'Choose (or create) a folder such as OneDrive › MindMaps.',
  'sync.step2':
    'Allow this site to edit files there. Choose "Allow on every visit" if your browser offers it.',
  'sync.step3': 'Do the same on your other computers, with the same folder.',
  'sync.onDemandTip':
    'Tip: in File Explorer, right-click the folder and choose "Always keep on this device", so files from your other computers are ready even offline.',
  'sync.choose': 'Choose folder…',
  'sync.change': 'Change folder…',
  'sync.unlink': 'Stop syncing',
  'sync.now': 'Sync now',
  'sync.linkedTo': 'Syncing with the folder “{name}”.',
  'sync.lastSync': 'last synced {time}',
  'sync.pausedDetail':
    '{missing} of {known} project files disappeared from the folder at once. That usually means OneDrive is paused or the wrong folder is linked, so no projects were moved to the Trash.',
  'sync.checkAgain': 'Check again',
  'sync.trashAnyway': 'Trash them anyway',
  'sync.pausedToast': 'Folder sync paused: several project files are missing from the folder.',
  'sync.skippedSummary': '{count} file(s) skipped',
  'sync.skip.unavailable': 'not downloaded yet; will try again',
  'sync.skip.invalid': 'not a valid project file',
  'sync.skip.newer': 'made by a newer version of the app; update this PC (reload) to sync it',
  'sync.newerToast':
    'A project in your sync folder was made by a newer version of the app. Reload to update this PC; until then that file is left untouched.',
  'sync.skip.busy': 'in use by another program; will try again',
  'sync.skip.open-unsaved': 'open here with unsaved changes; will try again',
  'sync.skip.open-removed': 'deleted on another computer; moves to the Trash when you close it',
  'sync.failed': 'Folder sync failed: {error}',
  'sync.copyLabel': 'conflict copy {date}',
  'sync.conflictToast':
    '“{name}” was changed on two computers. Both versions are kept; the older one is a conflict copy.',
  'sync.created.one': 'Added {count} project from your sync folder',
  'sync.created.other': 'Added {count} projects from your sync folder',
  'sync.trashedHere.one':
    'Moved {count} project to the Trash: its file was deleted on another computer',
  'sync.trashedHere.other':
    'Moved {count} projects to the Trash: their files were deleted on another computer',
  'sync.updatedOpen':
    'Updated with the newer version from your other computer. Undo brings back this one.',
  'sync.restored.one':
    'Brought back {count} project from the Trash: it was restored on another computer',
  'sync.restored.other':
    'Brought back {count} projects from the Trash: they were restored on another computer',
  'sync.openRemoved':
    '“{name}” was deleted on another computer. It stays open here and moves to the Trash when you close it.',
  'sync.presetConflict':
    'Preset “{name}” was changed on two computers. This one is kept; the other is saved as a copy.',
  // Images in the sync folder (#149)
  'sync.images.pending.one':
    '{count} image is not in the sync folder yet (OneDrive may still be downloading it); it shows as a placeholder and will be tried again.',
  'sync.images.pending.other':
    '{count} images are not in the sync folder yet (OneDrive may still be downloading them); they show as placeholders and will be tried again.',
  'sync.images.rejected.one':
    '{count} image file in the folder’s _assets does not match its name, so it was not used.',
  'sync.images.rejected.other':
    '{count} image files in the folder’s _assets do not match their names, so they were not used.',
} as const

registerMessages(syncMessages)
