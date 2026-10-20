import { registerMessages } from '../index'

/**
 * English text used only by the tag editor and the tag filter panel (#150,
 * H-0 area). It ships in their lazily loaded chunks, not the startup bundle.
 */
export const tagsMessages = {
  'tags.inputLabel': 'Add a tag',
  'tags.placeholder': 'Add a tag…',
  'tags.remove': 'Remove tag #{tag}',
  'tags.suggestions': 'Tags used in this project',
  'tags.invalid': 'A tag uses letters, digits, - _ or /, up to 32 characters.',
  'tags.full': 'A node can have up to 10 tags.',
  'tags.hint': 'Enter or comma adds a tag; Backspace in the empty field removes the last one.',
  'tags.dialogTitle': 'Tags of {title}',
  'tags.dialogMany.one': 'Add tags to 1 node',
  'tags.dialogMany.other': 'Add tags to {count} nodes',
  'tags.add': 'Add',
  'tags.done': 'Done',
  'tags.panelLabel': 'Filter by tag',
  'tags.none':
    'No node here has tags yet. Add them in the details panel, or end a title with #tag while renaming.',
  'tags.option.one': '#{tag}, 1 node',
  'tags.option.other': '#{tag}, {count} nodes',
  'tags.combine': 'Show nodes with',
  'tags.any': 'any of them',
  'tags.all': 'all of them',
  'tags.display': 'Other nodes',
  'tags.highlight': 'Dim',
  'tags.hide': 'Hide',
  'tags.matches.one': '1 match',
  'tags.matches.other': '{count} matches',
  'tags.clear': 'Clear',
  'tags.close': 'Close the tag filter',
  'tags.filterOn': 'Tag filter: {tags}',
  'tags.clearFilter': 'Clear the tag filter',
} as const

registerMessages(tagsMessages)
