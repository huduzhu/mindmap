import { registerMessages } from '../index'

/**
 * English text used only by the link picker and the colour/marker picker
 * (#148b, H-0). It ships in that lazily loaded chunk, not the startup bundle:
 * every module that uses one of these keys imports this file, which registers
 * the table before the module runs.
 */
export const pickersMessages = {
  'link.title': 'Link “{name}” to…',
  'link.find': 'Find the node to link to',
  'link.placeholder': 'Type part of a node’s title…',
  'link.noMatch': 'No other node matches “{query}”.',
  'link.none': 'No other nodes to link.',
  'link.nodes': 'Nodes',
  'link.in': 'in {name}',
  'link.hint': '↑ ↓ to choose · Enter to link · Esc to cancel',
  'marks.colorHint': 'Colours come from the style preset, so they follow the theme.',
  'marks.custom': 'Or type an emoji',
  'marks.use': 'Use',
  'marks.invalid': 'Type one emoji, for example 🔥',
  'marks.colorChoices': 'Colours',
  'marks.markerChoices': 'Markers',
} as const

registerMessages(pickersMessages)
