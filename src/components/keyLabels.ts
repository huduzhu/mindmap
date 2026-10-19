import { t, type MessageKey } from '../i18n'

/**
 * Key names that are words rather than key caps (#137): shown in the
 * interface language. Everything else (Ctrl, Shift, Tab, F2, ↑…) is printed
 * as it appears on the keyboard.
 */
const KEY_LABELS: Partial<Record<string, MessageKey>> = {
  Space: 'key.space',
  'Shift+Space': 'key.shiftSpace',
  Tap: 'key.tap',
  'Double-tap': 'key.doubleTap',
  'Long-press': 'key.longPress',
  'Shift+click': 'key.shiftClick',
  'Shift+drag': 'key.shiftDrag',
  Swipe: 'present.key.swipe',
  'Two-finger tap': 'present.key.twoFingerTap',
  '#tag': 'key.hashTag',
}

export function keyLabel(key: string): string {
  const label = KEY_LABELS[key]
  return label ? t(label) : key
}
