/** docs/themes-i18n-touch.svg: style presets, the preset editor, English ⇄ 简体中文, screen readers and touch. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  C,
  Movie,
  N,
  about,
  caption,
  circle,
  drawNode,
  drawnEdge,
  edge,
  edgePath,
  keys,
  move,
  on,
  path,
  pointer,
  progressBar,
  rect,
  ring,
  ripple,
  show,
  text,
  textWidth,
  typed,
  windowBack,
} from '../svg-movie.mjs'
import { button } from './ui.mjs'

const presetDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'presets')
const preset = (name) => JSON.parse(readFileSync(join(presetDir, `${name}.json`), 'utf8'))

/** Display names (src/i18n/en/presets.ts) of the built-in presets, in the order the app lists them. */
const PRESETS = [
  ['default', 'Default'],
  ['dark', 'Dark'],
  ['corporate', 'Corporate'],
  ['handdrawn', 'Hand-drawn'],
  ['colorblind-safe', 'Colour-blind safe'],
]

/** A step ("smoothstep") or straight-ish connector, or a bezier for the curve setting. */
function connector(a, b, curve) {
  if (curve === 'bezier') return edgePath(a, b)
  const x1 = a.r
  const x2 = b.x
  const mx = (x1 + x2) / 2
  const r = Math.min(8, Math.abs(b.cy - a.cy) / 2)
  if (Math.abs(b.cy - a.cy) < 1) return `M${x1} ${a.cy}H${x2}`
  const dir = b.cy > a.cy ? 1 : -1
  return `M${x1} ${a.cy}H${mx - r}Q${mx} ${a.cy} ${mx} ${a.cy + dir * r}V${b.cy - dir * r}Q${mx} ${b.cy} ${mx + r} ${b.cy}H${x2}`
}

/** The sample map drawn with a preset's real palette, roles, lines and typeface. */
function presetMap(p, ox, oy) {
  const pal = p.palette
  const fam = p.font.family
  const root = N('Launch plan', 'root', { x: ox, cy: oy })
  const branches = ['Audience', 'Channels', 'Pricing'].map((t, i) =>
    N(t, 'branch', { x: ox + 200, cy: oy - 80 + i * 80 }),
  )
  const leaves = [
    [0, 'Students'],
    [0, 'Small teams'],
    [2, 'Tiers'],
  ].map(([bi, t], i) => ({
    bi,
    n: N(t, 'leaf', { x: ox + 360, cy: branches[bi].cy + (i === 1 ? 20 : i === 0 ? -20 : 0) }),
  }))
  const theme = p.roles.theme
  const main = p.roles['main-branch']
  const leaf = p.roles.leaf ?? {}
  const rx = (shape, h) => (shape === 'box' ? 3 : shape === 'pill' ? h / 2 : 9)
  const line = (d, color) =>
    path(d, { stroke: color, sw: p.edges.width, dash: p.edges.dashed ? '6 5' : undefined })
  const label = (n, value, fill, weight) =>
    text(n.x + n.k.pad, n.cy + n.k.size * 0.36, value, {
      size: n.k.size,
      weight,
      fill,
      family: fam,
    })
  const parts = [
    rect(ox - 40, oy - 150, 600, 300, { rx: 10, fill: pal.background, stroke: pal.nodeBorder }),
  ]
  branches.forEach((b, i) =>
    parts.push(line(connector(root, b, p.edges.curve), pal.branchColors[i])),
  )
  leaves.forEach(({ bi, n }) =>
    parts.push(line(connector(branches[bi], n, p.edges.curve), pal.branchColors[bi])),
  )
  parts.push(
    rect(root.x, root.y, root.w, root.h, { rx: rx(theme.shape, root.h), fill: theme.fill }),
    label(root, 'Launch plan', theme.text, 700),
  )
  branches.forEach((b, i) => {
    parts.push(
      rect(b.x, b.y, b.w, b.h, {
        rx: rx(main.shape, b.h),
        fill: main.fill ?? pal.nodeFill,
        stroke: pal.branchColors[i],
        sw: 2,
      }),
    )
    parts.push(label(b, b.label, pal.text, 700))
  })
  leaves.forEach(({ n }) => {
    parts.push(
      rect(n.x, n.y, n.w, n.h, {
        rx: rx(leaf.shape, n.h),
        fill: leaf.fill ?? pal.nodeFill,
        stroke: leaf.border ?? pal.nodeBorder,
        sw: 1.3,
      }),
    )
    parts.push(label(n, n.label, pal.text, 400))
  })
  return parts.join('')
}

export function themesI18nTouch() {
  const S = [0, 6.6, 12.6, 18.4, 24.6]
  const m = new Movie({
    id: 'tt',
    width: 960,
    height: 500,
    duration: S[4],
    poster: 3.0,
    title: 'Mind Map Studio: looks, languages and accessibility',
    desc:
      'A looping animation in four scenes. 1: the same map in the built-in presets Default, Dark, Corporate, Hand-drawn and Colour-blind safe, each with its own colours, shapes, lines and typeface. ' +
      '2: in the preset editor a light text colour brings up the warning Some text may be hard to read (aim for 4.5:1 or more), a dark one clears it, and the lines switch from steps to curves. ' +
      '3: Switch the interface to 简体中文 changes the toolbar to 导图, 头脑风暴, 大纲 and 分屏, the details panel to 详情, and the guide button to 入门指南. ' +
      '4: a screen reader hears Added Pricing under Launch Plan, keyboard focus is outlined, and on a tablet tapping a node shows the action bar Child, Sibling, Rename, Notes, Delete, Fold and More.',
  })
  const out = [windowBack(m)]

  /* --- scene 1: presets --- */
  {
    const per = (S[1] - 0.4) / PRESETS.length
    const parts = [text(40, 128, 'PRESETS', { size: 11, weight: 700, fill: C.mute })]
    PRESETS.forEach(([file, name], i) => {
      const a = 0.2 + i * per
      const b = a + per
      const y = 142 + i * 36
      parts.push(rect(36, y, 200, 30, { rx: 7, fill: C.white, stroke: C.rule }))
      parts.push(m.ag({ o: show(a, b + 0.05, 0.2) }, rect(36, y, 200, 30, { rx: 7, fill: C.blue })))
      parts.push(
        text(50, y + 19.5, `${name}${i < 5 ? ' (built-in)' : ''}`, {
          size: 13,
          weight: 600,
          fill: C.ink,
        }),
      )
      parts.push(
        m.ag(
          { o: show(a, b + 0.05, 0.2) },
          text(50, y + 19.5, `${name} (built-in)`, { size: 13, weight: 600, fill: C.white }),
        ),
      )
      parts.push(m.ag({ o: show(a, b + 0.3, 0.3) }, presetMap(preset(file), 320, 290)))
    })
    parts.push(
      text(40, 352, 'System follows your device’s', { size: 12, fill: C.mute }),
      text(40, 368, 'light or dark mode.', { size: 12, fill: C.mute }),
    )
    out.push(m.ag({ o: show(S[0], S[1]) }, parts))
    out.push(
      caption(
        m,
        S[0],
        S[1],
        'Style presets',
        'One map, five built-in looks: colours, shapes, lines and typeface.',
      ),
    )
  }

  /* --- scene 2: the preset editor --- */
  {
    const T0 = S[1]
    const light = '#cbd5e1'
    const dark = C.ink
    const rows = [
      ['Background', '#f8fafc'],
      ['Text', null],
      ['Quiet text', '#64748b'],
      ['Node fill', '#ffffff'],
    ]
    const bad = [T0 + 1.2, T0 + 2.9]
    const parts = [
      rect(60, 110, 840, 340, {
        rx: 12,
        fill: C.white,
        stroke: C.line,
        filter: `url(#${m.id}-shadow)`,
      }),
      text(82, 140, 'Edit preset', { size: 15, weight: 700 }),
      text(82, 170, 'COLOURS', { size: 11, weight: 700, fill: C.mute }),
    ]
    rows.forEach(([label, col], i) => {
      const y = 182 + i * 34
      parts.push(text(82, y + 18, label, { size: 13 }))
      if (col) parts.push(rect(200, y + 2, 44, 24, { rx: 6, fill: col, stroke: C.line }))
      else
        parts.push(
          m.ag(
            {
              o: [
                [bad[0], 1],
                [bad[0] + 0.2, 0],
                [bad[1], 0],
                [bad[1] + 0.2, 1],
              ],
            },
            rect(200, y + 2, 44, 24, { rx: 6, fill: dark, stroke: C.line }),
          ),
          m.ag(
            { o: show(bad[0], bad[1] + 0.2, 0.2) },
            rect(200, y + 2, 44, 24, { rx: 6, fill: light, stroke: C.line }),
          ),
        )
    })
    parts.push(
      text(82, 340, 'LINES', { size: 11, weight: 700, fill: C.mute }),
      text(82, 368, 'Shape', { size: 13 }),
    )
    const shapes = ['Steps', 'Curves', 'Straight']
    let sx = 140
    const curveAt = T0 + 3.9
    shapes.forEach((s, i) => {
      const w = textWidth(s, 12, 600) + 20
      parts.push(
        rect(sx, 352, w, 26, { rx: 6, fill: C.white, stroke: C.line }),
        text(sx + w / 2, 369, s, { size: 12, weight: 600, fill: C.mute, anchor: 'middle' }),
      )
      const win =
        i === 0
          ? [
              [0, 1],
              [curveAt, 1],
              [curveAt + 0.2, 0],
            ]
          : i === 1
            ? [
                [curveAt, 0],
                [curveAt + 0.2, 1],
              ]
            : null
      if (win)
        parts.push(
          m.ag({ o: win }, [
            rect(sx, 352, w, 26, { rx: 6, fill: C.blue }),
            text(sx + w / 2, 369, s, { size: 12, weight: 600, fill: C.white, anchor: 'middle' }),
          ]),
        )
      sx += w + 6
    })
    // Live preview (editor.sampleRoot / sampleA / sampleB).
    const pr = N('Central topic', 'root', { x: 470, cy: 230 })
    const pa = N('An idea', 'leaf', { x: 680, cy: 185 })
    const pb = N('Another idea', 'leaf', { x: 680, cy: 275 })
    parts.push(
      rect(450, 150, 430, 160, { rx: 10, fill: '#f8fafc', stroke: C.rule }),
      text(462, 168, 'Preview', { size: 11, weight: 700, fill: C.mute }),
    )
    for (const n of [pa, pb]) {
      parts.push(
        m.ag(
          {
            o: [
              [curveAt, 1],
              [curveAt + 0.3, 0],
            ],
          },
          path(connector(pr, n, 'smoothstep'), { stroke: C.faint, sw: 2 }),
        ),
      )
      parts.push(
        m.ag({ o: on(curveAt, 0.3) }, path(connector(pr, n, 'bezier'), { stroke: C.faint, sw: 2 })),
      )
    }
    parts.push(drawNode(pr))
    for (const n of [pa, pb]) {
      parts.push(drawNode(n, { label: false }))
      parts.push(
        m.ag(
          {
            o: [
              [bad[0], 1],
              [bad[0] + 0.2, 0],
              [bad[1], 0],
              [bad[1] + 0.2, 1],
            ],
          },
          text(n.x + 12, n.cy + 4.7, n.label, { size: 13, fill: dark }),
        ),
      )
      parts.push(
        m.ag(
          { o: show(bad[0], bad[1] + 0.2, 0.2) },
          text(n.x + 12, n.cy + 4.7, n.label, { size: 13, fill: light }),
        ),
      )
    }
    parts.push(
      m.ag({ o: show(bad[0] + 0.2, bad[1] + 0.2, 0.25) }, [
        rect(450, 322, 430, 56, { rx: 8, fill: C.amberSoft, stroke: C.amber }),
        text(466, 344, 'Some text may be hard to read (aim for 4.5:1 or more):', {
          size: 12.5,
          weight: 600,
          fill: C.amber,
        }),
        text(466, 366, 'Text on node fill: 1.5:1', { size: 12.5, fill: C.ink }),
      ]),
    )
    parts.push(button(760, 400, 'Save and use', { primary: true }).svg)
    parts.push(
      pointer(
        m,
        [
          [T0 + 0.5, 600, 430],
          [T0 + 1.0, 222, 230],
          [T0 + 2.5, 222, 230],
          [T0 + 2.8, 222, 230],
          [T0 + 3.5, 222, 230],
          [T0 + 3.8, 210, 365],
        ],
        T0 + 4.6,
      ),
      ripple(m, T0 + 1.1, 222, 230),
      ripple(m, T0 + 2.8, 222, 230),
      ripple(m, T0 + 3.9, 210, 365),
    )
    out.push(m.ag({ o: show(S[1], S[2]) }, parts))
    out.push(
      caption(
        m,
        S[1],
        S[2],
        'Make your own preset',
        'Change colours, typeface and lines with a live preview and a contrast check.',
      ),
    )
  }

  /* --- scene 3: English ⇄ 简体中文 --- */
  {
    const T0 = S[2]
    const sw = T0 + 2.6
    const en = {
      brand: 'Mind Map Studio',
      tabs: ['Mind Map', 'Brainstorm', 'Outline', 'Split view'],
      details: 'Details',
      notes: 'Notes',
      guide: 'Try the guide · 入门指南',
      map: 'Mind map',
    }
    const zh = {
      brand: '思维导图工作室',
      tabs: ['导图', '头脑风暴', '大纲', '分屏'],
      details: '详情',
      notes: '备注',
      guide: '入门指南 · Try the guide',
      map: '导图',
    }
    const ui = (L) => {
      const parts = [text(44, 133, L.brand, { size: 15, weight: 700 })]
      let x = 240
      L.tabs.forEach((t, i) => {
        const w = textWidth(t, 13, 600) + 24
        parts.push(
          rect(x, 113, w, 28, {
            rx: 7,
            fill: i === 0 ? C.blue : C.white,
            stroke: i === 0 ? C.blue : C.line,
          }),
        )
        parts.push(
          text(x + w / 2, 132, t, {
            size: 13,
            weight: 600,
            fill: i === 0 ? C.white : C.mute,
            anchor: 'middle',
          }),
        )
        x += w + 6
      })
      parts.push(
        text(624, 186, L.details, { size: 15, weight: 700 }),
        text(624, 238, L.notes.toUpperCase(), { size: 11, weight: 700, fill: C.mute }),
      )
      parts.push(text(624, 210, `Pricing · ${L.map}`, { size: 12, fill: C.mute }))
      parts.push(button(44, 400, L.guide, { size: 12.5 }).svg)
      return parts.join('')
    }
    const r = N('Launch plan', 'root', { x: 70, cy: 290 })
    const p = N('Pricing', 'branch', { x: 270, cy: 290 })
    const parts = [
      rect(24, 104, 912, 46, { rx: 10, fill: C.paper, stroke: C.rule }),
      rect(604, 160, 316, 220, { rx: 10, fill: C.white, stroke: C.line }),
      rect(624, 250, 276, 60, { rx: 7, fill: C.paper, stroke: C.rule }),
      edge(r, p),
      drawNode(r),
      drawNode(p),
      ring(p),
      m.ag(
        {
          o: [
            [sw, 1],
            [sw + 0.4, 0],
          ],
        },
        ui(en),
      ),
      m.ag({ o: on(sw, 0.4) }, ui(zh)),
      // Ctrl+K → "Switch the interface to 简体中文".
      m.ag({ o: show(T0 + 0.7, sw + 0.1, 0.2) }, [
        rect(260, 170, 440, 100, {
          rx: 12,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        typed(m, 282, 198, 'switch', T0 + 1.0, T0 + 1.4, { size: 14 }),
        rect(270, 214, 420, 30, { rx: 7, fill: C.blueSoft }),
        text(284, 234, 'Switch the interface to 简体中文', { size: 13.5 }),
      ]),
    ]
    out.push(m.ag({ o: show(S[2], S[3]) }, parts))
    out.push(
      keys(m, T0 + 0.5, ['Ctrl', 'K'], { dur: 0.9 }),
      keys(m, T0 + 2.3, ['Enter'], { dur: 0.7 }),
    )
    out.push(
      caption(
        m,
        S[2],
        S[3],
        'English and 简体中文',
        'Switch the language at any time; the interface changes at once.',
      ),
    )
  }

  /* --- scene 4: screen reader and touch --- */
  {
    const T0 = S[3]
    const r = N('Launch Plan', 'root', { x: 60, cy: 290 })
    const a = N('Audience', 'branch', { x: 240, cy: 240 })
    const p = N('Pricing', 'branch', { x: 240, cy: 340 })
    const parts = [edge(r, a), drawNode(r), drawNode(a), drawnEdge(m, r, p, T0 + 0.8, T0 + 1.1)]
    parts.push(m.ag({ o: on(T0 + 0.9, 0.25) }, drawNode(p)))
    parts.push(
      m.ag({ o: show(T0 + 0.2, T0 + 0.9, 0.1) }, ring(r, C.blue, 5)),
      m.ag({ o: show(T0 + 0.9, S[4], 0.15) }, ring(p, C.blue, 5)),
    )
    parts.push(
      m.ag({ o: show(T0 + 1.2, S[4], 0.3), t: move(T0 + 1.2, T0 + 1.5, [0, 6], [0, 0]) }, [
        rect(44, 392, 400, 46, { rx: 10, fill: C.ink }),
        text(60, 412, 'SCREEN READER', { size: 10.5, weight: 700, fill: C.sky }),
        text(60, 430, 'Added Pricing under Launch Plan', { size: 13.5, fill: C.white }),
      ]),
    )
    // Tablet with the touch action bar (touch.*).
    const tr = N('Launch Plan', 'root', { x: 540, cy: 260 })
    const tp = N('Pricing', 'branch', { x: 720, cy: 260 })
    const tc = N('Tiers', 'leaf', { x: 830, cy: 330 })
    const labels = ['Child', 'Sibling', 'Rename', 'Notes', 'Delete', 'Fold', 'More']
    const bar = []
    let bx = 0
    for (const l of labels) {
      const w = textWidth(l, 11.5, 600) + 16
      bar.push(
        rect(bx, 0, w, 30, { rx: 7, fill: C.white, stroke: C.line }),
        text(bx + w / 2, 19.5, l, { size: 11.5, weight: 600, anchor: 'middle' }),
      )
      bx += w + 4
    }
    const barX = 500 + (420 - bx) / 2
    parts.push(
      rect(496, 108, 428, 340, { rx: 26, fill: C.ink }),
      rect(510, 122, 400, 312, { rx: 14, fill: C.paper }),
      edge(tr, tp),
      drawNode(tr),
      drawNode(tp),
      m.ag({ o: show(T0 + 2.4, S[4], 0.2) }, ring(tp)),
      m.ag({ o: show(T0 + 2.4, S[4], 0.25), t: move(T0 + 2.4, T0 + 2.7, [0, 8], [0, 0]) }, [
        rect(barX - 6, 384, bx + 8, 42, {
          rx: 10,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        `<g transform="translate(${barX.toFixed(1)} 390)">${bar.join('')}</g>`,
      ]),
      m.ag(
        { o: show(T0 + 3.5, T0 + 3.9, 0.08) },
        rect(barX, 390, textWidth('Child', 11.5, 600) + 16, 30, {
          rx: 7,
          fill: C.blue,
          opacity: 0.25,
        }),
      ),
      edge(tp, tc).replace('<path', `<path class="${m.cls({ o: on(T0 + 3.9, 0.25) })}"`),
      m.ag(
        { o: on(T0 + 3.9, 0.25), t: move(T0 + 3.9, T0 + 4.2, about(tc.cx, tc.cy, 0.6), [0, 0]) },
        drawNode(tc),
      ),
      m.ag(
        {
          o: show(T0 + 2.0, T0 + 2.6, 0.1),
          t: move(T0 + 2.0, T0 + 2.5, about(tp.cx, tp.cy, 0.5), about(tp.cx, tp.cy, 1.3)),
        },
        circle(tp.cx, tp.cy, 18, { fill: C.blue, opacity: 0.3 }),
      ),
      m.ag(
        {
          o: show(T0 + 3.5, T0 + 4.0, 0.1),
          t: move(T0 + 3.5, T0 + 3.9, about(barX + 25, 405, 0.5), about(barX + 25, 405, 1.3)),
        },
        circle(barX + 25, 405, 16, { fill: C.blue, opacity: 0.3 }),
      ),
    )
    out.push(m.ag({ o: show(S[3], S[4]) }, parts))
    out.push(keys(m, T0 + 0.6, ['Tab'], { dur: 0.8 }))
    out.push(
      caption(
        m,
        S[3],
        S[4],
        'Screen readers, keyboard and touch',
        'Edits are announced, focus is visible, and a tap shows the node’s actions.',
      ),
    )
  }

  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
