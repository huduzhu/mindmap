/**
 * The HTML-export viewer's own words (#99). A small table of its own, not the
 * app's i18n, so the exported file stays small; the export records the
 * language the app was in.
 */
export type ViewerLocale = 'en' | 'zh-CN'

const STRINGS = {
  en: {
    search: 'Search nodes…',
    searchLabel: 'Search nodes',
    hint: 'drag to pan · pinch or scroll to zoom · tap a node for notes',
    notes: 'Node notes',
    closeNotes: 'Close notes',
    expand: 'Expand {count} hidden',
    collapse: 'Collapse branch',
    done: 'Done: {title}',
    notDone: 'Not done: {title}',
    progress: '{done} of {total} tasks done',
    missing:
      'This mind map file is incomplete: no embedded data was found. Re-export it from Mind Map Studio.',
    present: 'Present',
    presentTitle: 'Present the map one step at a time (F5)',
    tags: 'Filter by tag',
    tagsAll: 'All',
    // Pictures on nodes (#149)
    enlarge: 'Show the picture larger',
    imageView: 'Picture: {title}',
    closeImage: 'Close the picture (Esc)',
    imageMissing: 'Picture not included',
    // Presentation mode (#152), the same words as the app's present.* group.
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
  },
  'zh-CN': {
    search: '搜索节点…',
    searchLabel: '搜索节点',
    hint: '拖动以平移 · 双指或滚轮缩放 · 点按节点查看备注',
    notes: '节点备注',
    closeNotes: '关闭备注',
    expand: '展开 {count} 个隐藏节点',
    collapse: '折叠分支',
    done: '已完成：{title}',
    notDone: '未完成：{title}',
    progress: '{total} 项任务已完成 {done} 项',
    missing: '此思维导图文件不完整：未找到嵌入的数据。请从 Mind Map Studio 重新导出。',
    present: '演示',
    presentTitle: '逐步演示导图（F5）',
    tags: '按标签筛选',
    tagsAll: '全部',
    enlarge: '放大查看图片',
    imageView: '图片：{title}',
    closeImage: '关闭图片（Esc）',
    imageMissing: '未包含图片',
    'present.label': '正在演示 {title}',
    'present.step': '第 {n} 步，共 {total} 步：{title}',
    'present.stepUnder': '第 {n} 步，共 {total} 步：{title}，属于 {parent}',
    'present.notesSpoken': '备注：{notes}',
    'present.counter': '{n} / {total}',
    'present.goTo': '跳到第 {n} 步',
    'present.progress': '进度',
    'present.previous': '上一步',
    'present.next': '下一步',
    'present.exit': '退出演示（Esc）',
    'present.blanked': '屏幕已遮黑。按 B 恢复显示。',
    'present.controls': '演示控制',
    'present.done': '已完成：{title}',
    'present.notDone': '未完成：{title}',
    'present.tasks': '{total} 项任务已完成 {done} 项',
  },
} satisfies Record<ViewerLocale, Record<string, string>>

export type ViewerKey = keyof (typeof STRINGS)['en']

export function viewerLocale(value: unknown): ViewerLocale {
  if (value === 'zh-CN' || value === 'en') return value
  if (typeof value === 'string' && value.toLowerCase().startsWith('zh')) return 'zh-CN'
  return 'en'
}

export function viewerText(
  locale: ViewerLocale,
  key: ViewerKey,
  params: Record<string, string | number> = {},
): string {
  return STRINGS[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}
