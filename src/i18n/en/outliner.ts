import { registerMessages } from '../index'

/**
 * English text used only by the Brainstorm and Outline views (H-0). It ships in
 * that lazily loaded chunk, not the startup bundle: every module that uses one
 * of these keys imports this file, which registers the table before the module
 * runs.
 */
export const outlinerMessages = {
  'outliner.touchHint':
    'Tap an idea to select it, tap again to rename. The buttons below indent, move and delete it.',
  'outliner.add': '+ Add idea',
  'outliner.toMap': '→ Copy to map…',
  'outliner.hint':
    'Click a row to rename it, or press Enter to add a bullet, Tab to nest it, Shift+Tab to lift it back out.',
  'outliner.addNotes': 'Add notes',
  'outliner.editNotes': 'Edit notes',
  'outliner.notesTitle': 'Notes: {notes}',
  'outliner.dropRoot': 'Drop here to promote to a root idea',
  'outliner.treeLabel': 'Brainstorm ideas',
  'outliner.cycle': 'Cannot move an idea into its own descendant.',
  'toMap.empty': 'The brainstorm is empty — add some ideas first.',
  'toMap.title': 'Copy brainstorm to map',
  'toMap.message.one':
    'Turn {count} brainstorm bullet into map branches. Top-level bullets become main branches; notes come along. The brainstorm is not changed.',
  'toMap.message.other':
    'Turn {count} brainstorm bullets into map branches. Top-level bullets become main branches; notes come along. The brainstorm is not changed.',
  'toMap.append': 'Add under the map’s root',
  'toMap.keep.one': 'Keeps the {count} existing branch.',
  'toMap.keep.other': 'Keeps the {count} existing branches.',
  'toMap.noBranches': 'The map has no branches yet.',
  'toMap.replace': 'Replace the map’s branches',
  'toMap.remove.one': 'Removes the current {count} branch (Undo brings it back).',
  'toMap.remove.other': 'Removes the current {count} branches (Undo brings them back).',
  'toMap.sameAsAdd': 'Same as adding, since the map is empty.',
  'toMap.copied.one': 'Copied {count} idea from the brainstorm. Undo reverts it in one step.',
  'toMap.copied.other': 'Copied {count} ideas from the brainstorm. Undo reverts it in one step.',
  'toMap.replaced.one':
    'Replaced the map with {count} idea from the brainstorm. Undo reverts it in one step.',
  'toMap.replaced.other':
    'Replaced the map with {count} ideas from the brainstorm. Undo reverts it in one step.',
  'outline.addTitle': 'Add a child idea',
  'outline.treeLabel': 'Outline of the mind map',
  'outline.hint':
    'Click any row to rename it. Click ✎ to edit notes, role, or side. Press Enter for a sibling, Tab to indent, or Shift+Tab to lift it back out.',
  'outline.touchHint':
    'Tap a row to select it, tap again to rename. The buttons below indent, move and delete it.',
  'touch.rowBar': 'Idea actions',
  'touch.addIdea': 'Add',
  'touch.addIdeaLabel': 'Add an idea after {name}',
  'touch.indent': 'Indent',
  'touch.indentLabel': 'Indent {name} under the idea above',
  'touch.outdent': 'Outdent',
  'touch.outdentLabel': 'Outdent {name}',
  'touch.up': 'Up',
  'touch.upLabel': 'Move {name} up',
  'touch.down': 'Down',
  'touch.downLabel': 'Move {name} down',
  'touch.showOnMap': 'On map',
  'touch.showOnMapLabel': 'Show {name} on the map',
  'outliner.fold': 'Collapse',
  'outliner.unfold': 'Expand ({count} hidden)',
} as const

registerMessages(outlinerMessages)
