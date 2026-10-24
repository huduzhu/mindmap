/** docs/present-and-palette.svg: search, the command palette and keyboard moves. */
import {
  C,
  Movie,
  N,
  about,
  caption,
  circle,
  drawNode,
  edge,
  el,
  g,
  keys,
  move,
  off,
  on,
  path,
  pill,
  progressBar,
  rect,
  ring,
  show,
  text,
  typed,
  windowBack,
} from '../svg-movie.mjs'

export function presentAndPalette() {
  const S = [0, 9, 15.4]
  const m = new Movie({
    id: 'pp',
    width: 960,
    height: 500,
    duration: S[2],
    poster: 2.6,
    title: 'Mind Map Studio: search, the command palette and keyboard moves',
    desc:
      'A looping animation in two scenes. 1: Ctrl+F searches for price; the folded Marketing branch opens to show the match Price page, 1 of 2, and Enter moves to Price survey, 2 of 2. ' +
      'Ctrl+K opens the command palette and the arrow keys move through commands such as Go to Outline and Export SVG image. ' +
      '2: the arrow keys move the selection from Q3 plan to Pricing to Tiers, following the right side of the map; F2 renames Tiers to Plan tiers, then the left arrow goes back to Pricing and the down arrow to Hiring.',
  })
  const out = [windowBack(m)]

  const r = N('Q3 plan', 'root', { center: 480, cy: 290 })
  const pr = N('Pricing', 'branch', { x: 600, cy: 215 })
  const tiers = N('Tiers', 'leaf', { x: 740, cy: 215 })
  const hi = N('Hiring', 'branch', { x: 600, cy: 365 })
  const de = N('Designer', 'leaf', { x: 740, cy: 365 })
  const mk = N('Marketing', 'branch', { right: 360, cy: 365 })
  const pg = N('Price page', 'leaf', { right: 220, cy: 340 })
  const ads = N('Ads', 'leaf', { right: 220, cy: 390 })
  const pd = N('Product', 'branch', { right: 360, cy: 215 })
  const ps = N('Price survey', 'leaf', { right: 220, cy: 215 })
  const tree = [
    [r, pr],
    [pr, tiers],
    [r, hi],
    [hi, de],
    [r, mk],
    [mk, pg],
    [mk, ads],
    [r, pd],
    [pd, ps],
  ]

  /* --- scene 1: search, then the palette --- */
  {
    const unfold = 1.8
    const parts = []
    for (const [a, b] of tree) {
      if (a === mk) parts.push(m.ag({ o: on(unfold, 0.4) }, [edge(a, b), drawNode(b)]))
      else parts.push(edge(a, b))
    }
    for (const n of [r, pr, tiers, hi, de, mk, pd, ps]) parts.push(drawNode(n))
    parts.push(
      m.ag(
        {
          o: [
            [unfold, 1],
            [unfold + 0.2, 0],
          ],
        },
        pill(mk.x - 36, mk.cy - 10, '+2', {
          fill: C.blue,
          color: C.white,
          size: 11.5,
          h: 20,
          w: 30,
        }).svg,
      ),
    )
    // Matches: Price page (current, then Price survey after Enter).
    const match = (n, o) =>
      m.ag(o, [
        rect(n.x, n.y, n.w, n.h, { rx: n.k.rx, fill: C.amberSoft, stroke: C.amber, sw: 1.5 }),
        text(n.x + n.k.pad, n.cy + 4.7, n.label, { size: 13 }),
      ])
    parts.push(
      match(pg, { o: show(unfold + 0.1, 4.7, 0.3) }),
      match(ps, { o: show(unfold + 0.1, 4.7, 0.3) }),
    )
    parts.push(
      m.ag({ o: show(unfold + 0.1, 3.3, 0.2) }, ring(pg, C.amber)),
      m.ag({ o: show(3.3, 4.7, 0.2) }, ring(ps, C.amber)),
    )
    // Search bar.
    const bar = [
      rect(300, 112, 360, 36, {
        rx: 9,
        fill: C.white,
        stroke: C.blue,
        sw: 1.8,
        filter: `url(#${m.id}-shadow)`,
      }),
      circle(321, 128.5, 6, { stroke: C.mute, sw: 1.8 }),
      path('M325.5 133L330 137.5', { stroke: C.mute, sw: 1.8 }),
      typed(m, 340, 135, 'price', 1.0, 1.5, { size: 14 }),
      m.ag(
        {
          o: [
            [1.65, 0],
            [1.85, 1],
            [3.2, 1],
            [3.35, 0],
          ],
        },
        text(644, 135, '1 of 2', { size: 13, fill: C.mute, anchor: 'end' }),
      ),
      m.ag(
        { o: on(3.3, 0.15) },
        text(644, 135, '2 of 2', { size: 13, fill: C.mute, anchor: 'end' }),
      ),
    ]
    parts.push(m.ag({ o: show(0.6, 4.8, 0.25), t: move(0.6, 0.85, [0, -8], [0, 0]) }, bar))
    // Command palette.
    const items = [
      'Go to Mind Map',
      'Go to Brainstorm',
      'Go to Outline',
      'Go to Split view',
      'Show details',
      'Export PNG image',
      'Export SVG image',
      'Export for AI…',
      'Filter by tag…',
    ]
    const L = { x: 270, y: 166, w: 420, row: 30, rows: 5 }
    const presses = [5.7, 6.2, 6.7, 7.2, 7.7, 8.2]
    const pal = [
      rect(260, 112, 440, 254, {
        rx: 12,
        fill: C.white,
        stroke: C.line,
        filter: `url(#${m.id}-shadow)`,
      }),
      text(282, 141, 'Search commands…', { size: 14, fill: C.faint }),
      path('M261 156.5H699', { stroke: C.rule }),
      text(480, 352, '↑ ↓ to browse · Enter to run · Esc to close', {
        size: 12,
        fill: C.mute,
        anchor: 'middle',
      }),
    ]
    // Highlight row position and list scroll per press.
    const hiKeys = [[0, [0, 0]]]
    const scrollKeys = [[0, [0, 0]]]
    presses.forEach((t, i) => {
      const idx = i + 1
      const offset = Math.max(0, idx - (L.rows - 1))
      const prevOffset = Math.max(0, idx - 1 - (L.rows - 1))
      hiKeys.push([t, [0, (idx - 1 - prevOffset) * L.row]], [t + 0.18, [0, (idx - offset) * L.row]])
      scrollKeys.push([t, [0, -prevOffset * L.row]], [t + 0.18, [0, -offset * L.row]])
    })
    const clip = m.uid('clip')
    pal.push(el('clipPath', { id: clip }, rect(L.x - 4, L.y - 4, L.w + 8, L.rows * L.row + 4)))
    pal.push(
      g({ 'clip-path': `url(#${clip})` }, [
        m.ag({ t: hiKeys }, rect(L.x, L.y, L.w, L.row - 4, { rx: 7, fill: C.blueSoft })),
        m.ag(
          { t: scrollKeys },
          items.map((item, i) => text(L.x + 12, L.y + i * L.row + 18, item, { size: 13.5 })),
        ),
      ]),
    )
    parts.push(
      m.ag(
        { o: show(4.8, 8.75, 0.25) },
        rect(0.5, 35, 959, 430, { fill: C.white, fillOpacity: 0.6 }),
      ),
    )
    parts.push(
      m.ag({ o: show(4.85, 8.75, 0.25), t: move(4.85, 5.1, about(480, 240, 0.96), [0, 0]) }, pal),
    )
    out.push(m.ag({ o: show(S[0], S[1]) }, parts))
    out.push(
      keys(m, 0.45, ['Ctrl', 'F'], { dur: 1.1 }),
      keys(m, 3.15, ['Enter'], { dur: 0.9 }),
      keys(m, 4.6, ['Ctrl', 'K'], { dur: 1.0 }),
    )
    presses.forEach((t) => out.push(keys(m, t - 0.05, ['↓'], { dur: 0.42 })))
    out.push(keys(m, 8.45, ['Esc'], { dur: 0.6 }))
    out.push(
      caption(
        m,
        S[0],
        S[1],
        'Search and the command palette',
        'Ctrl+F finds nodes even in folded branches. Ctrl+K runs any command.',
      ),
    )
  }

  /* --- scene 2: moving and renaming from the keyboard --- */
  {
    const T0 = S[1]
    const tiers2 = N('Plan tiers', 'leaf', { x: tiers.x, cy: tiers.cy })
    const parts = []
    for (const [a, b] of tree) if (b !== tiers) parts.push(edge(a, b))
    parts.push(edge(pr, tiers))
    for (const n of [r, pr, hi, de, mk, pg, ads, pd, ps]) parts.push(drawNode(n))
    parts.push(m.ag({ o: off(T0 + 3.55, 0.15) }, drawNode(tiers)))
    parts.push(m.ag({ o: on(T0 + 3.6, 0.15) }, drawNode(tiers2)))
    // Rename (F2): an edit box over the node, the new title typed in.
    const editW = tiers2.w + 24
    parts.push(
      m.ag({ o: show(T0 + 2.25, T0 + 3.65, 0.1) }, [
        rect(tiers.x, tiers.y, editW, tiers.h, { rx: 8, fill: C.white, stroke: C.blue, sw: 2 }),
        typed(m, tiers.x + 12, tiers.cy + 4.7, 'Plan tiers', T0 + 2.45, T0 + 3.05, { size: 13 }),
      ]),
    )
    // The selection: root → Pricing → Tiers (→ follows the right side), then back and down.
    const sel = [
      [r, T0 + 0.1, T0 + 0.9],
      [pr, T0 + 0.9, T0 + 1.6],
      [tiers, T0 + 1.6, T0 + 2.3],
      [tiers2, T0 + 3.6, T0 + 4.3],
      [pr, T0 + 4.3, T0 + 5.0],
      [hi, T0 + 5.0, S[2]],
    ]
    for (const [n, a, b] of sel) parts.push(m.ag({ o: show(a, b, 0.15) }, ring(n)))
    out.push(m.ag({ o: show(S[1], S[2]) }, parts))
    for (const [t, k] of [
      [T0 + 0.75, ['→']],
      [T0 + 1.45, ['→']],
      [T0 + 2.1, ['F2']],
      [T0 + 3.3, ['Enter']],
      [T0 + 4.15, ['←']],
      [T0 + 4.85, ['↓']],
    ])
      out.push(keys(m, t, k, { dur: 0.6 }))
    out.push(
      caption(
        m,
        S[1],
        S[2],
        'Move and rename from the keyboard',
        'Arrow keys follow the sides of the map; F2 renames, Enter keeps it.',
      ),
    )
  }
  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
