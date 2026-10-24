/** docs/views-and-focus.svg: three views of one project, and focus on one branch. */
import {
  C,
  Movie,
  N,
  about,
  caption,
  circle,
  drawNode,
  drawnEdge,
  kbd,
  keys,
  move,
  off,
  on,
  path,
  pill,
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
import { viewTabs, card } from './ui.mjs'

export function viewsAndFocus() {
  const S = [0, 6.2, 11.2, 18.2, 23]
  const m = new Movie({
    id: 'vf',
    width: 960,
    height: 500,
    duration: S[4],
    poster: 5.3,
    title: 'Mind Map Studio: three views of one project, and focus on one branch',
    desc:
      'A looping animation in four scenes. 1: on the mind map canvas, Tab adds a child node and Space folds a branch, which then shows a +3 badge. ' +
      '2: Alt+Right arrow focuses on the Launch Plan branch; the rest of the map clears and a breadcrumb bar reads Product launch, Launch Plan. ' +
      '3: in the Brainstorm outliner ideas are typed with Enter and nested with Tab, then Copy to map turns them into map nodes. ' +
      '4: Split view shows the Brainstorm beside the map’s Outline, each pane editable.',
  })
  const out = []
  out.push(
    windowBack(
      m,
      viewTabs(
        m,
        ['Mind Map', 'Brainstorm', 'Outline', 'Split view'],
        [
          ['Mind Map', S[0], S[2]],
          ['Brainstorm', S[2], S[3]],
          ['Split view', S[3], S[4]],
        ],
      ),
    ),
  )

  /* --- scenes 1 and 2: the map, then focus --- */
  const rootN = N('Product launch', 'root', { center: 480, cy: 285 })
  const lp = N('Launch Plan', 'branch', { x: 610, cy: 205 })
  const mk = N('Marketing', 'branch', { x: 610, cy: 365 })
  const rs = N('Research', 'branch', { right: 350, cy: 225 })
  const bd = N('Budget', 'branch', { right: 350, cy: 345 })
  const lpKids = [
    N('Beta list', 'leaf', { x: 780, cy: 160 }),
    N('Press kit', 'leaf', { x: 780, cy: 205 }),
  ]
  const pricing = N('Pricing', 'leaf', { x: 780, cy: 250 })
  const mkKids = ['Blog', 'Social', 'Email'].map((t, i) =>
    N(t, 'leaf', { x: 780, cy: 325 + i * 40 }),
  )
  const rsKids = [
    N('Interviews', 'leaf', { right: 190, cy: 200 }),
    N('Survey', 'leaf', { right: 190, cy: 250 }),
  ]
  const bdKids = [N('Costs', 'leaf', { right: 190, cy: 345 })]

  // Camera for focus: fit the Launch Plan branch in the middle of the stage.
  const box = {
    x0: lp.x,
    x1: Math.max(...[...lpKids, pricing].map((n) => n.r)),
    y0: lpKids[0].y,
    y1: pricing.b,
  }
  const s = 1.6
  const tx = 480 - s * ((box.x0 + box.x1) / 2)
  const ty = 300 - s * ((box.y0 + box.y1) / 2)

  const branchIn = { o: on(0.6) }
  const kidIn = { o: on(1.15) }
  const rest = [
    // Everything that is not the Launch Plan branch fades when focusing.
    drawnEdge(m, rootN, lp, 0.3, 0.9),
    drawnEdge(m, rootN, mk, 0.3, 0.9),
    drawnEdge(m, rootN, rs, 0.3, 0.9),
    drawnEdge(m, rootN, bd, 0.3, 0.9),
    ...rsKids.map((n) => drawnEdge(m, rs, n, 0.9, 1.4)),
    ...bdKids.map((n) => drawnEdge(m, bd, n, 0.9, 1.4)),
    m.ag(
      { o: off(4.4, 0.4) },
      mkKids.map((n) => drawnEdge(m, mk, n, 0.9, 1.4)),
    ),
    drawNode(rootN),
    m.ag(branchIn, [drawNode(mk), drawNode(rs), drawNode(bd)]),
    m.ag(
      {
        o: [
          [1.15, 0],
          [1.5, 1],
          [4.4, 1],
          [4.8, 0],
        ],
      },
      mkKids.map((n) => drawNode(n)),
    ),
    m.ag(
      kidIn,
      [...rsKids, ...bdKids].map((n) => drawNode(n)),
    ),
    // Folded: a +3 badge on the outer side of Marketing.
    m.ag({ o: on(4.7, 0.3), t: move(4.7, 5.0, about(mk.r + 18, mk.cy, 0.5), [0, 0]) }, [
      pill(mk.r + 6, mk.cy - 10, '+3', { fill: C.blue, color: C.white, size: 11.5, h: 20, w: 30 })
        .svg,
    ]),
    m.ag({ o: show(3.8, 6.4, 0.2) }, ring(mk)),
  ]
  const focusBranch = [
    ...lpKids.map((n) => drawnEdge(m, lp, n, 0.9, 1.4)),
    drawnEdge(m, lp, pricing, 2.6, 3.0),
    m.ag(branchIn, drawNode(lp)),
    m.ag(
      kidIn,
      lpKids.map((n) => drawNode(n)),
    ),
    m.ag(
      { o: on(2.75, 0.25), t: move(2.75, 3.1, about(pricing.cx, pricing.cy, 0.6), [0, 0]) },
      drawNode(pricing),
    ),
    m.ag(
      {
        o: [
          [1.9, 0],
          [2.1, 1],
          [3.6, 1],
          [3.8, 0],
          [6.1, 0],
          [6.3, 1],
          [6.9, 1],
          [7.2, 0],
        ],
      },
      ring(lp),
    ),
    // Focused: the branch becomes the centre of its own map.
    m.ag(
      { o: on(7.5, 0.4) },
      drawNode({
        ...lp,
        k: { ...lp.k, ...N('x', 'root', { x: 0, cy: 0 }).k, size: 14, pad: 14, rx: 9 },
      }),
    ),
  ]
  out.push(
    m.ag({ o: show(S[0], S[2]) }, [
      m.ag({ t: move(6.6, 7.8, [0, 0, 1], [tx, ty, s]) }, [
        m.ag({ o: off(6.6, 0.8) }, rest),
        ...focusBranch,
      ]),
    ]),
  )

  // Breadcrumb bar (FocusBar): "Product launch › Launch Plan", Esc / Alt+← up one level, ×.
  {
    const y = 104
    const parts = [rect(24, y, 912, 34, { rx: 8, fill: C.paper, stroke: C.rule })]
    const a = 'Product launch'
    parts.push(text(40, y + 22, a, { size: 13.5, fill: C.blue, weight: 600 }))
    const sep = 40 + textWidth(a, 13.5, 600) + 10
    parts.push(text(sep, y + 22, '›', { size: 15, fill: C.faint }))
    parts.push(text(sep + 16, y + 22, 'Launch Plan', { size: 13.5, weight: 700 }))
    parts.push(text(916, y + 23, '×', { size: 18, fill: C.mute, anchor: 'middle' }))
    const hint = 'up one level'
    const hx = 896 - textWidth(hint, 12.5)
    parts.push(text(hx, y + 22, hint, { size: 12.5, fill: C.mute }))
    const k2 = kbd(0, 0, 'Alt+←')
    const k1 = kbd(0, 0, 'Esc')
    parts.push(
      kbd(hx - 8 - k2.w, y + 7.5, 'Alt+←').svg,
      kbd(hx - 14 - k2.w - k1.w, y + 7.5, 'Esc').svg,
    )
    out.push(m.ag({ o: show(7.3, S[2], 0.35), t: move(7.3, 7.7, [0, -10], [0, 0]) }, parts))
  }

  out.push(
    keys(m, 2.25, ['Tab']),
    keys(m, 4.1, ['Space']),
    keys(m, 6.3, ['Alt', '→'], { dur: 1.5 }),
  )
  out.push(
    caption(
      m,
      S[0],
      S[1],
      'Mind map canvas',
      'Branches on both sides. Tab adds a child; Space folds a branch.',
    ),
    caption(
      m,
      S[1],
      S[2],
      'Focus on one branch',
      'Alt+→ works in one branch as if it were the whole map.',
    ),
  )

  /* --- scene 3: Brainstorm outliner, then Copy to map --- */
  const lines = [
    { t: 'Who is it for?', lvl: 0, from: 0, at: 11.6 },
    { t: 'Students', lvl: 1, from: 0, at: 12.05, tab: 12.55 },
    { t: 'Small teams', lvl: 1, from: 1, at: 13.05 },
    { t: 'Launch channels', lvl: 0, from: 1, at: 13.6, tab: 14.15 },
    { t: 'Newsletter', lvl: 1, from: 0, at: 14.65, tab: 15.15 },
  ]
  const lineY = (i) => 176 + i * 34
  const bulletX = (lvl) => 72 + lvl * 24
  const textX = (lvl) => 86 + lvl * 24
  const bulletRow = (line, i, animate) => {
    const y = lineY(i)
    const inner = [
      circle(bulletX(line.lvl), y, 3.5, { fill: line.lvl ? C.faint : C.blue }),
      animate
        ? typed(m, textX(line.lvl), y + 5, line.t, line.at, line.at + 0.42, { size: 14 })
        : text(textX(line.lvl), y + 5, line.t, { size: 14 }),
    ]
    if (!animate) return inner.join('')
    const tracks = { o: on(line.at - 0.05, 0.1) }
    if (line.tab)
      tracks.t = move(line.tab + 0.05, line.tab + 0.35, [(line.from - line.lvl) * 24, 0], [0, 0])
    return m.ag(tracks, inner)
  }
  const mapR = N('Product launch', 'root', { x: 478, cy: 280 })
  const b1 = N('Who is it for?', 'branch', { x: 652, cy: 220 })
  const b2 = N('Launch channels', 'branch', { x: 652, cy: 340 })
  const c1 = N('Students', 'leaf', { x: 820, cy: 196 })
  const c2 = N('Small teams', 'leaf', { x: 820, cy: 244 })
  const c3 = N('Newsletter', 'leaf', { x: 820, cy: 340 })
  const targets = [b1, c1, c2, b2, c3]
  {
    const parts = [card(40, 108, 420, 340, 'Brainstorm')]
    lines.forEach((line, i) => parts.push(bulletRow(line, i, true)))
    // The "→ Copy to map…" button.
    parts.push(rect(60, 394, 150, 32, { rx: 8, fill: C.blueSoft, stroke: C.blue }))
    parts.push(m.ag({ o: show(15.9, 16.6, 0.12) }, rect(60, 394, 150, 32, { rx: 8, fill: C.blue })))
    parts.push(
      text(135, 415, '→ Copy to map…', { size: 13.5, weight: 600, fill: C.blue, anchor: 'middle' }),
    )
    parts.push(
      m.ag(
        { o: show(15.9, 16.6, 0.12) },
        text(135, 415, '→ Copy to map…', {
          size: 13.5,
          weight: 600,
          fill: C.white,
          anchor: 'middle',
        }),
      ),
    )
    // The map fills in on the right.
    parts.push(m.ag({ o: on(16.0, 0.3) }, drawNode(mapR)))
    parts.push(drawnEdge(m, mapR, b1, 16.8, 17.2), drawnEdge(m, mapR, b2, 16.8, 17.2))
    parts.push(
      drawnEdge(m, b1, c1, 16.9, 17.3),
      drawnEdge(m, b1, c2, 16.9, 17.3),
      drawnEdge(m, b2, c3, 16.9, 17.3),
    )
    parts.push(
      m.ag(
        { o: on(16.7, 0.25) },
        targets.map((n) => drawNode(n)),
      ),
    )
    lines.forEach((line, i) => {
      const n = targets[i]
      const fx = textX(line.lvl)
      const fy = lineY(i) + 5
      const tx2 = n.x + n.k.pad
      const ty2 = n.cy + n.k.size * 0.36
      parts.push(
        m.ag(
          {
            o: [
              [16.05, 0],
              [16.15, 1],
              [16.75, 1],
              [16.95, 0],
            ],
            t: move(16.1 + i * 0.04, 16.75, [0, 0], [tx2 - fx, ty2 - fy]),
          },
          [text(fx, fy, line.t, { size: 14, fill: C.blue, weight: 600 })],
        ),
      )
    })
    parts.push(
      pointer(
        m,
        [
          [15.3, 330, 470],
          [15.85, 140, 412],
        ],
        16.7,
      ),
      ripple(m, 15.9, 140, 412),
    )
    out.push(m.ag({ o: show(S[2], S[3]) }, parts))
  }
  out.push(
    keys(m, 12.5, ['Tab'], { dur: 0.9 }),
    keys(m, 14.1, ['Shift', 'Tab'], { dur: 0.9 }),
    keys(m, 15.1, ['Tab'], { dur: 0.7 }),
    caption(
      m,
      S[2],
      S[3],
      'Brainstorm outliner',
      'Enter for the next idea, Tab to nest it, then copy the ideas to the map.',
    ),
  )

  /* --- scene 4: split view --- */
  {
    const parts = [card(40, 108, 430, 340, 'Brainstorm'), card(490, 108, 430, 340, 'Outline')]
    lines.forEach((line, i) => parts.push(bulletRow(line, i, false)))
    parts.push(
      m.ag({ o: on(18.85, 0.1) }, [
        circle(bulletX(1), lineY(5), 3.5, { fill: C.faint }),
        typed(m, textX(1), lineY(5) + 5, 'Webinar', 18.9, 19.3, { size: 14 }),
      ]),
    )
    const rows = [
      ['Product launch', 0, true],
      ['Who is it for?', 1, true],
      ['Students', 2],
      ['Small teams', 2],
      ['Launch channels', 1, true],
      ['Newsletter', 2],
    ]
    rows.forEach(([label, lvl, parent], i) => {
      const x = 516 + lvl * 22
      const y = lineY(i)
      if (parent)
        parts.push(
          path(`M${x - 4} ${y - 3}L${x} ${y + 2}L${x + 4} ${y - 3}`, { stroke: C.mute, sw: 1.6 }),
        )
      else parts.push(circle(x, y, 3, { fill: C.faint }))
      parts.push(text(x + 14, y + 5, label, { size: 14, weight: lvl === 0 ? 700 : 400 }))
    })
    parts.push(
      m.ag({ o: on(20.85, 0.1) }, [
        circle(516 + 44, lineY(6), 3, { fill: C.faint }),
        typed(m, 516 + 44 + 14, lineY(6) + 5, 'Podcast', 20.9, 21.3, { size: 14 }),
      ]),
    )
    parts.push(
      m.ag(
        { o: show(18.3, 20.2, 0.25) },
        rect(37, 105, 436, 346, { rx: 14, stroke: C.blue, sw: 2.5 }),
      ),
    )
    parts.push(
      m.ag(
        { o: show(20.1, S[4], 0.25) },
        rect(487, 105, 436, 346, { rx: 14, stroke: C.blue, sw: 2.5 }),
      ),
    )
    parts.push(
      pointer(
        m,
        [
          [19.6, 330, 380],
          [20.05, 700, 400],
        ],
        20.6,
      ),
      ripple(m, 20.1, 700, 400),
    )
    out.push(m.ag({ o: show(S[3], S[4]) }, parts))
  }
  out.push(
    keys(m, 18.65, ['Enter'], { dur: 0.9 }),
    keys(m, 20.6, ['Enter'], { dur: 0.9 }),
    caption(
      m,
      S[3],
      S[4],
      'Split view',
      'The Brainstorm beside the map’s Outline. Click a pane to type in it.',
    ),
  )

  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
