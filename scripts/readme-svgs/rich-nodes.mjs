/** docs/rich-nodes.svg: roles, colour, markers, tasks, tags, pictures, notes and links. */
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
  keys,
  move,
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
import { card, picture, checkbox } from './ui.mjs'

export function richNodes() {
  const S = [0, 5.6, 11.2, 16.8, 24.4]
  const m = new Movie({
    id: 'rn',
    width: 960,
    height: 500,
    duration: S[4],
    poster: 23.6,
    title:
      'Mind Map Studio: rich nodes with roles, colour, markers, tasks, tags, pictures, notes and labelled links',
    desc:
      'A looping animation in four scenes with the details panel open on the right (Ctrl+I). ' +
      '1: the node Sign-up target gets the role theme, a teal colour bar and a 🎯 marker. ' +
      '2: Ctrl+Enter ticks two child tasks of Go-live checklist and its progress goes from 1/3 to 2/3 to 3/3. ' +
      '3: typing #p1 #backend while renaming adds two tags, and the Tags filter dims the nodes without #backend. ' +
      '4: Ctrl+V pastes a picture onto the node Hero image, Shift+Space opens it full size, Markdown notes are written in the panel, and a dashed cross-link labelled depends on is drawn from Go-live to Hero image.',
  })
  const out = [windowBack(m)]

  /* --- the details panel (shown for the whole loop after Ctrl+I) --- */
  const PX = 632
  const PW = 304
  const panelTitle = (a, b, title) =>
    m.ag({ o: show(a, b, 0.25) }, [
      text(PX + 18, 174, title, { size: 15, weight: 700 }),
      text(PX + 18, 192, 'Mind map', { size: 12, fill: C.mute }),
    ])
  const label = (y, value) =>
    text(PX + 18, y, value.toUpperCase(), { size: 11, weight: 700, fill: C.mute })
  const panel = [
    card(PX, 104, PW, 358, 'Details', { filter: `url(#${m.id}-shadow)` }),
    text(PX + PW - 22, 133, '×', { size: 18, fill: C.mute, anchor: 'middle' }),
  ]

  /* --- scene 1: role, colour, marker --- */
  {
    const r = N('Website launch', 'root', { x: 48, cy: 283 })
    const a = N('Security review', 'branch', { x: 262, cy: 200 })
    const target = N('Sign-up target', 'branch', {
      x: 262,
      cy: 283,
      measure: '🎯 Sign-up target',
      extra: 6,
    })
    const c = N('Go-live checklist', 'branch', { x: 262, cy: 366 })
    const parts = [edge(r, a), edge(r, target), edge(r, c), drawNode(r), drawNode(a), drawNode(c)]
    parts.push(drawNode(target, { label: false }))
    parts.push(
      m.ag(
        { o: on(2.8, 0.3) },
        rect(target.x + 4, target.y + 6, 4, target.h - 12, { rx: 2, fill: C.teal }),
      ),
    )
    parts.push(
      m.ag(
        { t: move(3.8, 4.1, [0, 0], [24, 0]) },
        text(target.x + 14, target.cy + 5, 'Sign-up target', { size: 14, weight: 600 }),
      ),
    )
    parts.push(m.ag({ o: on(3.85, 0.3) }, text(target.x + 13, target.cy + 5.5, '🎯', { size: 15 })))
    parts.push(
      m.ag(
        { o: on(1.75, 0.3), t: move(1.75, 2.05, [0, 4], [0, 0]) },
        pill(target.r - 50, target.y - 22, 'theme', {
          fill: C.blue,
          color: C.white,
          size: 10.5,
          h: 17,
          w: 46,
        }).svg,
      ),
    )
    parts.push(m.ag({ o: on(0.9, 0.25) }, ring(target)))
    out.push(m.ag({ o: show(S[0], S[1]) }, parts))

    const p = [panelTitle(S[0], S[1], 'Sign-up target'), label(220, 'Role')]
    let x = PX + 18
    for (const role of ['None', 'theme', 'task', 'risk', 'question']) {
      const w = textWidth(role, 12, 600) + 18
      const chosen = role === 'theme'
      const base = rect(x, 230, w, 26, { rx: 13, fill: C.white, stroke: C.line })
      const hiNone =
        role === 'None'
          ? m.ag(
              {
                o: [
                  [1.6, 1],
                  [1.8, 0],
                ],
              },
              rect(x, 230, w, 26, { rx: 13, fill: C.soft, stroke: C.mute }),
            )
          : ''
      const hi = chosen
        ? m.ag({ o: on(1.6, 0.2) }, rect(x, 230, w, 26, { rx: 13, fill: C.blue }))
        : ''
      p.push(
        base,
        hiNone,
        hi,
        text(x + w / 2, 247, role, { size: 12, weight: 600, fill: C.mute, anchor: 'middle' }),
      )
      if (chosen)
        p.push(
          m.ag(
            { o: on(1.6, 0.2) },
            text(x + w / 2, 247, role, { size: 12, weight: 600, fill: C.white, anchor: 'middle' }),
          ),
        )
      x += w + 6
    }
    p.push(label(286, 'Colour'))
    const swatches = [C.blue, C.teal, C.amber, C.mute]
    swatches.forEach((col, i) => p.push(circle(PX + 30 + i * 32, 308, 10, { fill: col })))
    p.push(
      circle(PX + 30 + 4 * 32, 308, 10, { fill: C.white, stroke: C.faint }),
      path(`M${PX + 30 + 4 * 32 - 6} 314L${PX + 30 + 4 * 32 + 6} 302`, {
        stroke: C.faint,
        sw: 1.5,
      }),
    )
    p.push(m.ag({ o: on(2.6, 0.2) }, circle(PX + 62, 308, 14.5, { stroke: C.ink, sw: 2 })))
    p.push(label(352, 'Marker'))
    ;['🎯', '✅', '⭐', '💡', '❓'].forEach((e, i) =>
      p.push(text(PX + 30 + i * 36, 381, e, { size: 18, anchor: 'middle' })),
    )
    p.push(m.ag({ o: on(3.6, 0.2) }, rect(PX + 15, 360, 30, 30, { rx: 7, stroke: C.ink, sw: 2 })))
    p.push(
      pointer(
        m,
        [
          [1.2, 560, 420],
          [1.55, PX + 40, 246],
          [2.35, PX + 40, 246],
          [2.55, PX + 62, 312],
          [3.35, PX + 62, 312],
          [3.55, PX + 30, 380],
        ],
        4.6,
      ),
    )
    p.push(ripple(m, 1.6, PX + 40, 246), ripple(m, 2.6, PX + 62, 312), ripple(m, 3.6, PX + 30, 380))
    panel.push(m.ag({ o: show(S[0], S[1]) }, p))
  }

  /* --- scene 2: tasks with a rollup --- */
  {
    const parent = N('Go-live checklist', 'branch', { x: 70, cy: 283, extra: 64 })
    const kids = ['Write docs', 'Test payments', 'Book launch call'].map((t, i) =>
      N(t, 'leaf', { x: 350, cy: 213 + i * 70, extra: 32 }),
    )
    const doneAt = [0, 7.2, 8.95]
    const parts = [...kids.map((k) => edge(parent, k)), drawNode(parent)]
    kids.forEach((k, i) => {
      const tx = k.x + 12 + 24
      const tw = textWidth(k.label, 13)
      parts.push(drawNode(k, { dx: 24 }), checkbox(k.x + 12, k.cy - 7, false))
      const done = [
        checkbox(k.x + 12, k.cy - 7, true),
        path(`M${tx - 2} ${k.cy}H${tx + tw + 2}`, { stroke: C.mute, sw: 1.5 }),
      ]
      parts.push(i === 0 ? done.join('') : m.ag({ o: on(doneAt[i], 0.2) }, done))
    })
    const px = parent.r - 52
    const py = parent.cy - 10
    parts.push(rect(px, py, 40, 20, { rx: 10, fill: C.tealSoft }))
    parts.push(m.ag({ o: on(8.95, 0.25) }, rect(px, py, 40, 20, { rx: 10, fill: C.teal })))
    const count = (value, a, b, fill = C.teal) =>
      m.ag(
        {
          o:
            a <= S[1]
              ? [
                  [b, 1],
                  [b + 0.2, 0],
                ]
              : b >= S[2]
                ? on(a, 0.2)
                : show(a, b, 0.2),
        },
        text(px + 20, py + 14.5, value, { size: 12, weight: 700, fill, anchor: 'middle' }),
      )
    parts.push(count('1/3', S[1], 7.2), count('2/3', 7.2, 8.95), count('3/3', 8.95, S[2], C.white))
    parts.push(
      m.ag({ o: show(6.1, 8.2, 0.2) }, ring(kids[1])),
      m.ag({ o: show(8.2, S[2], 0.2) }, ring(kids[2])),
    )
    out.push(m.ag({ o: show(S[1], S[2]) }, parts))

    const p = [panelTitle(S[1], 8.2, 'Test payments'), panelTitle(8.2, S[2], 'Book launch call')]
    p.push(
      label(220, 'Task'),
      checkbox(PX + 18, 232, false),
      text(PX + 42, 244, 'Done', { size: 13.5 }),
    )
    p.push(
      m.ag(
        {
          o: [
            [7.2, 0],
            [7.4, 1],
            [8.1, 1],
            [8.3, 0],
            [8.95, 0],
            [9.15, 1],
          ],
        },
        checkbox(PX + 18, 232, true),
      ),
    )
    p.push(text(PX + 18, 290, 'Ctrl+Enter ticks the selected task.', { size: 12.5, fill: C.mute }))
    p.push(text(PX + 18, 310, 'A parent counts its done tasks.', { size: 12.5, fill: C.mute }))
    panel.push(m.ag({ o: show(S[1], S[2]) }, p))
    out.push(keys(m, 6.85, ['Ctrl', 'Enter']), keys(m, 8.6, ['Ctrl', 'Enter']))
  }

  /* --- scene 3: tags and the tag filter --- */
  {
    const r = N('Website launch', 'root', { x: 48, cy: 290 })
    const api = N('Backend API', 'branch', { x: 250, cy: 200, w: 132 })
    const apiTall = { ...api, y: api.cy - 25, h: 50 }
    const auth = N('Auth tokens', 'leaf', { x: 500, cy: 200, h: 46 })
    const landing = N('Landing page', 'branch', { x: 250, cy: 300 })
    const hero = N('Hero copy', 'leaf', { x: 500, cy: 300 })
    const support = N('Support docs', 'branch', { x: 250, cy: 390 })
    const faq = N('FAQ', 'leaf', { x: 500, cy: 390 })
    const dimAt = 14.75
    const dim = (keysTo) => ({
      o: [
        [dimAt, 1],
        [dimAt + 0.4, keysTo],
      ],
    })
    const chip = (x, y, tag) =>
      pill(x, y, tag, { fill: C.amberSoft, color: C.amber, size: 10.5, h: 16 })
    const parts = []
    parts.push(m.ag(dim(0.6), [edge(r, api), drawNode(r)]))
    parts.push(
      m.ag(dim(0.25), [
        edge(r, landing),
        edge(r, support),
        edge(landing, hero),
        edge(support, faq),
        drawNode(landing),
        drawNode(hero),
        drawNode(support),
        drawNode(faq),
      ]),
    )
    parts.push(edge(api, auth))
    parts.push(drawNode(auth, { ty: auth.cy - 4 }), chip(auth.x + 12, auth.cy + 4, '#backend').svg)
    // Backend API: plain, then being renamed, then tagged (taller, with chips).
    parts.push(
      m.ag(
        {
          o: [
            [11.75, 1],
            [11.85, 0],
          ],
        },
        drawNode(api),
      ),
    )
    const editW = 222
    parts.push(
      m.ag({ o: show(11.75, 13.05, 0.1) }, [
        rect(api.x, api.y, editW, api.h, { rx: 9, fill: C.white, stroke: C.blue, sw: 2 }),
        text(api.x + 14, api.cy + 5, 'Backend API', { size: 14, weight: 600 }),
        typed(
          m,
          api.x + 14 + textWidth('Backend API ', 14, 600),
          api.cy + 5,
          '#p1 #backend',
          12.0,
          12.7,
          { size: 14, weight: 600, fill: C.amber },
        ),
      ]),
    )
    const c1 = chip(apiTall.x + 14, apiTall.cy + 4, '#p1')
    const c2 = chip(apiTall.x + 14 + c1.w + 5, apiTall.cy + 4, '#backend')
    parts.push(
      m.ag({ o: on(13.0, 0.25) }, [drawNode(apiTall, { ty: apiTall.cy - 5 }), c1.svg, c2.svg]),
    )
    // The Tags filter button and panel ("Filter by tag", "Other nodes: Dim | Hide").
    parts.push(
      rect(32, 112, 70, 26, { rx: 7, fill: C.white, stroke: C.line }),
      text(67, 129.5, '# Tags', { size: 12.5, weight: 600, fill: C.mute, anchor: 'middle' }),
    )
    parts.push(
      m.ag({ o: on(13.95, 0.15) }, [
        rect(32, 112, 70, 26, { rx: 7, fill: C.blue }),
        text(67, 129.5, '# Tags', { size: 12.5, weight: 600, fill: C.white, anchor: 'middle' }),
      ]),
    )
    const pop = [
      rect(32, 146, 204, 116, {
        rx: 10,
        fill: C.white,
        stroke: C.line,
        filter: `url(#${m.id}-shadow)`,
      }),
      text(46, 168, 'Filter by tag', { size: 13, weight: 700 }),
      checkbox(46, 180, false),
      text(68, 192, '#backend, 2 nodes', { size: 12.5 }),
      m.ag({ o: on(14.6, 0.15) }, checkbox(46, 180, true)),
      checkbox(46, 204, false),
      text(68, 216, '#p1, 1 node', { size: 12.5 }),
      text(46, 245, 'Other nodes', { size: 12, fill: C.mute }),
      rect(130, 230, 48, 22, { rx: 6, fill: C.blue }),
      text(154, 245.5, 'Dim', { size: 12, weight: 600, fill: C.white, anchor: 'middle' }),
      rect(180, 230, 48, 22, { rx: 6, fill: C.white, stroke: C.line }),
      text(204, 245.5, 'Hide', { size: 12, weight: 600, fill: C.mute, anchor: 'middle' }),
    ]
    parts.push(m.ag({ o: on(14.05, 0.25), t: move(14.05, 14.3, [0, -6], [0, 0]) }, pop))
    parts.push(
      pointer(
        m,
        [
          [13.35, 300, 450],
          [13.9, 70, 128],
          [14.2, 70, 128],
          [14.5, 54, 188],
        ],
        15.6,
      ),
    )
    parts.push(ripple(m, 13.95, 70, 128), ripple(m, 14.55, 54, 188))
    parts.push(m.ag({ o: show(11.4, 13.4, 0.2) }, ring(apiTall)))
    out.push(m.ag({ o: show(S[2], S[3]) }, parts))

    const p = [panelTitle(S[2], S[3], 'Backend API'), label(220, 'Tags')]
    const t1 = pill(PX + 18, 230, '#p1', { fill: C.amberSoft, color: C.amber, size: 12, h: 22 })
    const t2 = pill(PX + 18 + t1.w + 6, 230, '#backend', {
      fill: C.amberSoft,
      color: C.amber,
      size: 12,
      h: 22,
    })
    p.push(m.ag({ o: on(13.0, 0.25) }, [t1.svg, t2.svg]))
    p.push(
      rect(PX + 18, 264, PW - 36, 30, { rx: 7, fill: C.white, stroke: C.line }),
      text(PX + 28, 284, 'Add a tag…', { size: 12.5, fill: C.faint }),
    )
    p.push(
      text(PX + 18, 322, 'End a title with #tag while renaming,', { size: 12.5, fill: C.mute }),
    )
    p.push(text(PX + 18, 340, 'or add tags here.', { size: 12.5, fill: C.mute }))
    panel.push(m.ag({ o: show(S[2], S[3]) }, p))
    out.push(keys(m, 11.5, ['F2'], { dur: 0.9 }), keys(m, 12.8, ['Enter'], { dur: 0.9 }))
  }

  /* --- scene 4: picture, lightbox, notes, labelled link --- */
  {
    const r = N('Website launch', 'root', { x: 48, cy: 300 })
    const brand = N('Brand', 'branch', { x: 250, cy: 226 })
    const logo = N('Logo', 'leaf', { x: 400, cy: 160 })
    const heroShort = N('Hero image', 'leaf', { x: 400, top: logo.b + 16 })
    const heroTall = N('Hero image', 'leaf', { x: 400, top: logo.b + 16, w: 132, h: 106 })
    const golive = N('Go-live', 'branch', { x: 250, cy: 380 })
    const pasteAt = 18.0
    const parts = [
      edge(r, brand),
      edge(r, golive),
      edge(brand, logo),
      drawNode(r),
      drawNode(brand),
      drawNode(golive),
      drawNode(logo),
    ]
    parts.push(
      m.ag(
        {
          o: [
            [pasteAt, 1],
            [pasteAt + 0.3, 0],
          ],
        },
        [edge(brand, heroShort), drawNode(heroShort)],
      ),
    )
    parts.push(
      m.ag({ o: on(pasteAt, 0.3) }, [
        edge(brand, heroTall),
        drawNode(heroTall, { label: false }),
        picture(heroTall.x + 10, heroTall.y + 10, 112, 63),
        text(heroTall.x + 12, heroTall.b - 12, 'Hero image', { size: 13 }),
      ]),
    )
    parts.push(
      m.ag({ o: show(17.1, 18.7, 0.2) }, ring(heroShort)),
      m.ag({ o: show(18.0, 18.7, 0.2) }, ring(heroTall)),
    )
    // The 16 px gap between Logo and the taller node below it (fixed in 1.0.5).
    parts.push(
      m.ag({ o: show(18.3, 19.1, 0.2) }, [
        path(`M${logo.r + 10} ${logo.b}V${heroTall.y}`, { stroke: C.amber, sw: 1.5 }),
        path(`M${logo.r + 6} ${logo.b}H${logo.r + 14}M${logo.r + 6} ${heroTall.y}H${logo.r + 14}`, {
          stroke: C.amber,
          sw: 1.5,
        }),
        text(logo.r + 18, logo.b + 12, '16 px', { size: 11, weight: 700, fill: C.amber }),
      ]),
    )
    // Labelled cross-link "depends on" from Go-live to Hero image, drawn through a mask.
    const linkD = `M${golive.r} ${golive.cy}C${golive.r + 220} ${golive.cy} ${heroTall.r + 110} ${heroTall.cy} ${heroTall.r + 4} ${heroTall.cy}`
    const maskId = m.uid('mask')
    parts.push(
      el('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 960, height: 500 }, [
        el('path', {
          d: linkD,
          fill: 'none',
          stroke: '#fff',
          'stroke-width': 8,
          pathLength: 1,
          'stroke-dasharray': 1,
          class: m.cls({ d: move(22.2, 22.9, 1, 0) }),
        }),
      ]),
    )
    parts.push(path(linkD, { stroke: C.blue, sw: 1.8, dash: '6 5', mask: `url(#${maskId})` }))
    parts.push(
      m.ag(
        { o: on(22.85, 0.2) },
        path(`M${heroTall.r + 4} ${heroTall.cy}l9 -3.5v7z`, { fill: C.blue }),
      ),
    )
    // The label sits at the middle of the link (the bezier at t = 0.5).
    const mid = {
      x: (golive.r + 3 * (golive.r + 220) + 3 * (heroTall.r + 110) + heroTall.r + 4) / 8,
      y: (golive.cy * 4 + heroTall.cy * 4) / 8,
    }
    const lab = pill(0, 0, 'depends on', {
      fill: C.white,
      stroke: C.blue,
      sw: 1.2,
      size: 11.5,
      h: 22,
    })
    parts.push(
      m.ag(
        { o: on(22.9, 0.25) },
        pill(mid.x - lab.w / 2, mid.y - 11, 'depends on', {
          fill: C.white,
          stroke: C.blue,
          sw: 1.2,
          size: 11.5,
          h: 22,
        }).svg,
      ),
    )
    // Lightbox (Shift+Space): the picture full size over the map.
    parts.push(
      m.ag({ o: show(19.15, 20.95, 0.3) }, [
        rect(14, 100, 604, 366, { rx: 10, fill: C.ink, fillOpacity: 0.98 }),
        text(316, 132, 'Image of Hero image', {
          size: 14,
          weight: 600,
          fill: C.white,
          anchor: 'middle',
        }),
        m.ag({ t: move(19.15, 19.6, about(316, 268, 0.4), [0, 0]) }, picture(156, 178, 320, 180)),
        // The zoom controls sit on their own solid bar, so nothing behind shows through.
        rect(226, 367, 180, 22, { rx: 11, fill: C.nightNode }),
        text(316, 382, '−    100%    +    Fit', {
          size: 13,
          fill: C.line,
          anchor: 'middle',
          mono: true,
        }),
        text(316, 404, 'Scroll or pinch to zoom, drag to move, 0 fits the picture.', {
          size: 12,
          fill: C.faint,
          anchor: 'middle',
        }),
      ]),
    )
    out.push(m.ag({ o: show(S[3], S[4]) }, parts))

    const p = [panelTitle(S[3], S[4], 'Hero image'), label(220, 'Picture')]
    p.push(rect(PX + 18, 230, 80, 45, { rx: 5, fill: C.soft }))
    p.push(
      m.ag({ o: on(pasteAt, 0.3) }, [
        picture(PX + 18, 230, 80, 45),
        text(PX + 110, 248, 'Description', { size: 11.5, fill: C.mute }),
        text(PX + 110, 266, 'Team at the launch', { size: 13 }),
      ]),
    )
    p.push(
      label(304, 'Notes'),
      text(PX + PW - 18, 304, 'Preview', { size: 12, fill: C.blue, weight: 600, anchor: 'end' }),
    )
    p.push(rect(PX + 18, 312, PW - 36, 78, { rx: 7, fill: C.paper, stroke: C.line }))
    const md = ['## Hero', '- **1600 × 900**, WebP', '- Shot at the launch party']
    md.forEach((line, i) =>
      p.push(
        m.ag(
          { o: on(21.0 + i * 0.4, 0.05) },
          typed(m, PX + 28, 334 + i * 21, line, 21.0 + i * 0.4, 21.32 + i * 0.4, {
            size: 12,
            mono: true,
            bg: C.paper,
          }),
        ),
      ),
    )
    p.push(label(414, 'Cross-links'))
    p.push(
      m.ag({ o: on(22.9, 0.25) }, [
        text(PX + 18, 438, '← Go-live', { size: 13, fill: C.blue, weight: 600 }),
        pill(PX + 92, 425, 'depends on', { size: 11, h: 19 }).svg,
      ]),
    )
    panel.push(m.ag({ o: show(S[3], S[4]) }, p))
    out.push(
      keys(m, 17.55, ['Ctrl', 'V']),
      keys(m, 18.9, ['Shift', 'Space']),
      keys(m, 20.6, ['Esc'], { dur: 0.8 }),
    )
  }

  out.push(
    m.ag(
      {
        o: [
          [0.45, 0],
          [0.8, 1],
          [S[4] - 0.35, 1],
          [S[4], 0],
        ],
        t: move(0.45, 0.85, [40, 0], [0, 0]),
      },
      panel,
    ),
  )
  out.push(keys(m, 0.3, ['Ctrl', 'I'], { dur: 1.0 }))
  out.push(
    caption(
      m,
      S[0],
      S[1],
      'Roles, colour and markers',
      'Ctrl+I opens the details panel: give a node a role, a colour, an emoji.',
    ),
    caption(
      m,
      S[1],
      S[2],
      'Tasks with progress',
      'Ctrl+Enter ticks a task; its parent counts what is done.',
    ),
    caption(
      m,
      S[2],
      S[3],
      'Tags and the tag filter',
      'End a title with #p1 #backend. The Tags filter dims everything else.',
    ),
    caption(
      m,
      S[3],
      S[4],
      'Pictures, notes and labelled links',
      'Paste a picture, open it with Shift+Space, add notes, name a link.',
    ),
  )
  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
