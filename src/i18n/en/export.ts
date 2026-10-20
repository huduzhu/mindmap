import { registerMessages } from '../index'

/**
 * English text used only by the "For AI…" and "Export this branch…" dialogs
 * (H-0). It ships in that lazily loaded chunk, not the startup bundle: every
 * module that uses one of these keys imports this file, which registers the
 * table before the module runs.
 */
export const exportMessages = {
  'ai.title': 'Export for AI',
  'ai.intro':
    'Downloads an analysis-request packet. Hand it to an AI assistant such as ChatGPT, Claude or Gemini and import the JSON file it returns.',
  'ai.intent': 'Intent',
  'ai.depth': 'Depth',
  'ai.expand': 'Grow the brainstorm list with more ideas (append-only).',
  'ai.convert': 'Turn the brainstorm into a structured mind map template.',
  'ai.improve': 'Sharpen titles, grouping, and notes across both sections.',
  'ai.titles': 'Structure only, smaller packet',
  'ai.full': 'Include notes',
  'ai.label.expand': 'Expand',
  'ai.label.convert': 'Convert to a map',
  'ai.label.improve': 'Improve',
  'ai.label.titles': 'Titles only',
  'ai.label.full': 'Full',
  'ai.download': 'Download packet',
  'branch.title': 'Export the branch {title}',
  'branch.intro': 'Only this branch and everything inside it is exported.',
  'branch.markdown': 'Markdown outline',
  'branch.opml': 'OPML outline',
  'branch.png': 'PNG image',
  'branch.svg': 'SVG image',
  'branch.json': 'JSON (opens as a new project)',
  'branch.html': 'Interactive HTML',
  'branch.ai': 'Packet for an AI to expand this branch',
  'branch.imageOnMap': 'Images are made from the mind map view.',
  'branch.name': '{project} – {branch}',
  'ai.branchOnly': 'Only the focused branch {title}',
} as const

registerMessages(exportMessages)
