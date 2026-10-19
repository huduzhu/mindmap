import { registerMessages } from '../index'

/**
 * English text used only by importing files, restoring backups and reading zips
 * (H-0). It ships in that lazily loaded chunk, not the startup bundle: every
 * module that uses one of these keys imports this file, which registers the
 * table before the module runs.
 */
export const filesMessages = {
  'image.switchToMap': 'Switch to the Mind Map tab first',
  'image.empty': 'This map has no nodes to capture',
  'import.presetMissing': 'Preset "{preset}" is not installed; falling back to "default".',
  'import.noSource':
    'No matching project: no project with id "{id}" exists in this library; imported as a new project instead.',
  'import.noMap':
    'This project has no mind map yet — use Copy brainstorm to map, or the convert workflow.',
  'import.cancelled': 'Import cancelled; nothing was changed.',
  'import.violation': 'The update violated the append-only contract ({parts}).',
  'import.violation.removed': '{count} removed',
  'import.violation.renamed': '{count} renamed',
  'import.violation.moved': '{count} re-parented',
  'import.violationKept':
    '{violation} It was imported as returned — compare it with the source project before discarding that.',
  'import.expandedName': '{name} (expanded)',
  'import.mergeOpenFailed': 'The source project could not be opened to merge into.',
  'import.mergeViolation': '{violation} Undo restores the brainstorm as it was before the merge.',
  'import.mergeUndo': 'Undo restores the brainstorm as it was.',
  'import.tooDeep':
    "This file's tree is nested {depth} levels deep; Mind Map Studio supports up to {max}.",
  'import.schema': 'File does not match the Mind Map Studio schema:\n{errors}',
  'import.wrongKind':
    'Only project, template, or brainstorm-update files can be imported (this file has kind "{kind}").',
  'import.template': 'Template imported as a new project.',
  'import.outlineTooDeep':
    'This outline is nested {depth} levels deep; Mind Map Studio supports up to {max}.',
  'import.noBullets': 'No bullet lines (- or *) found in this Markdown file.',
  'import.markdownInvalid': 'This Markdown file cannot be turned into a valid project:\n{errors}',
  'import.markdownDone': 'Imported {count} bullet(s) from Markdown into the brainstorm section.',
  'restore.noManifest':
    'This ZIP is not a Mind Map Studio backup (it has no readable manifest.json).',
  'restore.notBackup': 'This ZIP is not a Mind Map Studio backup.',
  'restore.newer':
    'This backup was made by a newer version of Mind Map Studio; update the app first.',
  'restore.item.preset': 'preset "{name}"',
  'restore.item.project': 'project "{name}"',
  'restore.item.snapshot': 'snapshot "{name}"',
  'restore.keptPresets.one':
    "Kept this browser's version of {count} preset with the same name ({names}).",
  'restore.keptPresets.other':
    "Kept this browser's version of {count} presets with the same name ({names}).",
  'restore.repairs': 'Some projects needed small repairs to match the schema.',
  'restore.skipped': 'Skipped {count} unreadable item(s): {items}.',
  'restore.imagesRejected.one': '{count} image in the backup was damaged and was left out.',
  'restore.imagesRejected.other': '{count} images in the backup were damaged and were left out.',
  'restore.summary': 'Restored {parts} from the backup.{detail}',
  'restore.projects.one': '{count} project',
  'restore.projects.other': '{count} projects',
  'restore.snapshots.one': '{count} snapshot',
  'restore.snapshots.other': '{count} snapshots',
  'restore.presets.one': '{count} preset',
  'restore.presets.other': '{count} presets',
  'restore.listSeparator': ', ',
  'zip.noDeflate': 'This browser cannot read compressed ZIP entries.',
  'zip.notZip': 'Not a ZIP file (no end-of-archive record).',
  'zip.zip64': 'ZIP64 archives are not supported.',
  'zip.badDirectory': 'The ZIP file is damaged (bad central directory).',
  'zip.noLocal': 'The ZIP file is damaged ("{name}" has no local header).',
  'zip.truncated': 'The ZIP file is truncated ("{name}").',
  'zip.method': '"{name}" uses an unsupported compression method ({method}).',
  'zip.checksum': 'The ZIP file is damaged ("{name}" failed its checksum).',
  'zip.tooLarge': 'The ZIP file is too large to restore ("{name}" would exceed the size limit).',
  'import.noSourceCopy':
    'This reply names project id "{id}", which is not in this library; imported as a new project instead.',
  'import.applyOpenFailed': 'The source project could not be opened to apply the reply.',
  'import.applyMapUndo': 'The brainstorm is unchanged; Undo puts the previous map back.',
  'import.applyProjectUndo': 'Undo puts the previous map and brainstorm back.',
} as const

registerMessages(filesMessages)
