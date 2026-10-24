/** docs/tour.svg: the hero reel, a quick look at the app's strongest moments. */
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
import { mini } from './folder-sync.mjs'
import { sampleMap } from './present-mode.mjs'
import { appWindow, installIcon, map as smallMap, tabs } from './pwa-offline.mjs'
import {
  browser,
  card,
  checkbox,
  fileIcon,
  folderIcon,
  miniApp,
  picture,
  presentStage,
  tagChip,
  viewTabs,
} from './ui.mjs'

const VIEWS = ['Mind Map', 'Brainstorm', 'Outline', 'Split view']

/** The centre of each view tab, laid out as viewTabs does. */
function tabCentres(width) {
  const centres = {}
  let x = width - 16
  for (let i = VIEWS.length - 1; i >= 0; i--) {
    const w = textWidth(VIEWS[i], 12, 600) + 20
    x -= w
    centres[VIEWS[i]] = x + w / 2
    x -= 4
  }
  return centres
}

/** A node that appears at `t`, with its title typed in unless `type` is false. */
function newNode(m, n, t, type = true) {
  if (!type)
    return m.ag(
      { o: on(t, 0.2), t: move(t, t + 0.25, about(n.cx, n.cy, 0.7), [0, 0]) },
      drawNode(n),
    )
  return m.ag({ o: on(t, 0.15) }, [
    drawNode(n, { label: false }),
    typed(m, n.x + n.k.pad, n.cy + n.k.size * 0.36, n.label, t + 0.1, t + 0.5, {
      size: n.k.size,
      weight: n.k.weight,
    }),
  ])
}

/** The key hints under the canvas (MindMapCanvas HINTS), centred on `cx`. */
function hintBar(cx, y) {
  const items = [
    ['Tab', 'child'],
    ['Enter', 'sibling'],
    ['F2', 'rename'],
    ['Space', 'fold/unfold'],
    ['Alt+Shift+F', 'flip side'],
  ]
  const widths = items.map(([k, label]) => kbd(0, 0, k).w + 5 + textWidth(label, 12))
  let x = cx - (widths.reduce((a, b) => a + b, 0) + 18 * (items.length - 1)) / 2
  const parts = []
  items.forEach(([k, label], i) => {
    const cap = kbd(x, y - 14, k)
    parts.push(cap.svg, text(x + cap.w + 5, y, label, { size: 12, fill: C.mute }))
    x += widths[i] + 18
  })
  return parts.join('')
}

export function tour() {
  const S = [0, 2.8, 9.8, 15.8, 22.0, 28.4, 33.4, 39.4]
  const m = new Movie({
    id: 'tour',
    width: 960,
    height: 540,
    duration: S[7],
    poster: 9.2,
    title: 'Mind Map Studio: a quick tour',
    desc:
      'A looping highlight reel in six scenes after a title card. ' +
      '1: a map is built from the keyboard: Tab adds the branch Hiring, which lands on the left, Tab and Enter add Designer and Engineer, and Alt+Shift+F flips Hiring to the other side. ' +
      '2: the same project in the Outline view, where Enter adds Bundles, then the Brainstorm, then Split view with the Brainstorm beside the Outline. ' +
      '3: rich nodes: a branch gets the role theme, a colour and a 🎯 marker, #p1 #pricing typed while renaming become tags, Ctrl+Enter ticks the last task (3/3), and Ctrl+V pastes a picture. ' +
      '4: F5 presents the map on a dark stage: the centre, then each branch clockwise, then into them, with earlier steps dimmed and a step counter. ' +
      '5: the install icon in the address bar installs the app in its own window; offline, a node is still added and saved on this device. ' +
      '6: a project syncs through a folder to another computer, and an AI assistant gets a packet and sends back a map that is put into the project.',
  })
  const out = [windowBack(m)]
  const tabX = tabCentres(m.width)
  out.push(
    m.ag(
      { o: show(S[1], S[4] + 0.9) },
      viewTabs(m, VIEWS, [
        ['Mind Map', S[1] - 0.2, 10.5],
        ['Outline', 10.5, 12.4],
        ['Brainstorm', 12.4, 14.0],
        ['Split view', 14.0, S[3]],
        ['Mind Map', S[3], S[4] + 0.9],
      ]),
    ),
  )

  /* --- title card --- */
  {
    const chapters = ['Build', 'Three views', 'Rich nodes', 'Present', 'Offline', 'Sync & AI']
    const chips = chapters.map((c) => pill(0, 0, c, { size: 12.5, h: 26, padX: 12 }))
    const total = chips.reduce((a, c) => a + c.w, 0) + 10 * (chips.length - 1)
    let x = 480 - total / 2
    const row = m.ag(
      { o: on(0.7, 0.4), t: move(0.7, 1.1, [0, 8], [0, 0]) },
      chapters.map((c, i) => {
        const chip = pill(x, 346, c, { size: 12.5, h: 26, padX: 12 })
        x += chips[i].w + 10
        return chip.svg
      }),
    )
    out.push(
      m.ag({ o: show(S[0], S[1]) }, [
        m.ag({ t: move(0, 0.5, about(480, 182, 0.7), [0, 0]) }, [
          rect(448, 150, 64, 64, { rx: 16, fill: C.blue }),
          path('M480 182L500 166M480 182L500 198M480 182L460 174M480 182L460 192', {
            stroke: C.white,
            sw: 2.5,
          }),
          circle(480, 182, 7, { fill: C.white }),
          circle(502, 165, 4, { fill: C.white }),
          circle(502, 199, 4, { fill: C.white }),
          circle(458, 173, 4, { fill: C.white }),
          circle(458, 193, 4, { fill: C.white }),
        ]),
        text(480, 270, 'Mind Map Studio', { size: 40, weight: 700, anchor: 'middle' }),
        text(480, 306, 'Offline mind mapping and brainstorming.', {
          size: 18,
          fill: C.mute,
          anchor: 'middle',
        }),
        row,
      ]),
    )
  }

  /* --- scene 1: build a map from the keyboard, then flip a branch --- */
  {
    const T = S[1]
    const map = sampleMap(290)
    const { root, pricing } = map
    const pKids = [map.tiers, map.discounts, map.trials]
    const hiring = map.hiring
    const designer = N('Designer', 'leaf', { right: 210, cy: 255 })
    const engineer = N('Engineer', 'leaf', { right: 210, cy: 325 })
    // After Alt+Shift+F: Hiring and its children on the right, Pricing moved up to make room.
    const up = -40
    const pricingUp = { ...pricing, y: pricing.y + up, cy: pricing.cy + up, b: pricing.b + up }
    const hR = N('Hiring', 'branch', { x: 610, cy: 400 })
    const dR = N('Designer', 'leaf', { x: 760, cy: 380 })
    const eR = N('Engineer', 'leaf', { x: 760, cy: 420 })
    const flip = 7.3
    const parts = [
      m.ag({ o: off(flip, 0.3) }, edge(root, pricing)),
      m.ag({ o: on(flip + 0.25, 0.3) }, edge(root, pricingUp)),
      m.ag({ t: move(flip, flip + 0.5, [0, 0], [0, up]) }, [
        ...pKids.map((k) => edge(pricing, k)),
        drawNode(pricing),
        ...pKids.map((k) => drawNode(k)),
      ]),
      drawNode(root),
      m.ag({ o: off(flip, 0.3), t: move(flip, flip + 0.4, [0, 0], [40, 0]) }, [
        drawnEdge(m, root, hiring, T + 0.5, T + 0.75),
        newNode(m, hiring, T + 0.6),
        drawnEdge(m, hiring, designer, T + 1.7, T + 1.95),
        newNode(m, designer, T + 1.8, false),
        drawnEdge(m, hiring, engineer, T + 2.9, T + 3.15),
        newNode(m, engineer, T + 3.0, false),
        m.ag(
          { o: [...show(T + 0.6, T + 1.8, 0.15), ...show(T + 3.8, flip + 0.2, 0.15)] },
          ring(hiring),
        ),
        m.ag({ o: show(T + 1.8, T + 3.0, 0.15) }, ring(designer)),
        m.ag({ o: show(T + 3.0, T + 3.8, 0.15) }, ring(engineer)),
      ]),
      m.ag({ o: on(flip + 0.2, 0.35), t: move(flip + 0.2, flip + 0.6, [-40, 0], [0, 0]) }, [
        edge(root, hR),
        edge(hR, dR),
        edge(hR, eR),
        drawNode(hR),
        drawNode(dR),
        drawNode(eR),
        ring(hR),
      ]),
      m.ag({ o: show(T, T + 0.6, 0.15) }, ring(root)),
    ]
    // With every branch on the right, the view re-centres on the map.
    out.push(
      m.ag({ o: show(S[1], S[2]) }, [
        m.ag({ t: move(flip + 0.5, flip + 1.1, [0, 0], [-150, 0]) }, parts),
        hintBar(480, 486),
      ]),
    )
    out.push(
      keys(m, T + 0.4, ['Tab'], { dur: 0.9 }),
      keys(m, T + 1.6, ['Tab'], { dur: 0.9 }),
      keys(m, T + 2.8, ['Enter'], { dur: 0.9 }),
      keys(m, flip - 0.2, ['Alt', 'Shift', 'F'], { dur: 1.3 }),
      caption(
        m,
        S[1],
        S[2],
        'Build it from the keyboard',
        'Tab adds a child, Enter a sibling; Alt+Shift+F flips a branch to the other side.',
      ),
    )
  }

  /* --- scene 2: one project, three views --- */
  {
    const T = S[2]
    const rows = [
      ['Launch plan', 0, true],
      ['Pricing', 1, true],
      ['Tiers', 2],
      ['Discounts', 2],
      ['Trials', 2],
      ['Hiring', 1, true],
      ['Designer', 2],
      ['Engineer', 2],
    ]
    const addAt = 11.3
    // Each view is one card; Split view slides them apart, side by side.
    const outlineRows = (x0, y0) => {
      const row = ([label, lvl, parent], y) => {
        const x = x0 + lvl * 22
        return [
          parent
            ? path(`M${x - 4} ${y - 3}L${x} ${y + 2}L${x + 4} ${y - 3}`, {
                stroke: C.mute,
                sw: 1.6,
              })
            : circle(x, y, 3, { fill: C.faint }),
          text(x + 14, y + 5, label, { size: 14, weight: lvl === 0 ? 700 : 400 }),
        ].join('')
      }
      const y = y0 + 5 * 30
      return [
        ...rows.slice(0, 5).map((r, i) => row(r, y0 + i * 30)),
        m.ag(
          { t: move(addAt, addAt + 0.25, [0, 0], [0, 30]) },
          rows.slice(5).map((r, i) => row(r, y0 + (i + 5) * 30)),
        ),
        m.ag({ o: on(addAt, 0.1) }, [
          circle(x0 + 44, y, 3, { fill: C.faint }),
          typed(m, x0 + 58, y + 5, 'Bundles', addAt + 0.15, addAt + 0.55, { size: 14 }),
        ]),
      ].join('')
    }
    const ideas = [
      ['Who is it for?', 0],
      ['Students', 1],
      ['Small teams', 1],
      ['Launch channels', 0],
      ['Newsletter', 1],
    ]
    const ideaRows = (x0, y0) =>
      ideas
        .map(([label, lvl], i) =>
          [
            circle(x0 + lvl * 24, y0 + i * 32, 3.5, { fill: lvl ? C.faint : C.blue }),
            text(x0 + 14 + lvl * 24, y0 + i * 32 + 5, label, { size: 14 }),
          ].join(''),
        )
        .join('')
    const split = 14.0
    const parts = [
      m.ag(
        {
          o: [
            [10.5, 0],
            [10.8, 1],
            [12.4, 1],
            [12.6, 0],
            [split, 0],
            [split + 0.3, 1],
          ],
          t: move(split, split + 0.4, [0, 0], [225, 0]),
        },
        [card(265, 108, 430, 350, 'Outline'), outlineRows(291, 176)],
      ),
      m.ag({ o: on(12.4, 0.3), t: move(split, split + 0.4, [0, 0], [-225, 0]) }, [
        card(265, 108, 430, 350, 'Brainstorm'),
        ideaRows(295, 176),
      ]),
      pointer(
        m,
        [
          [T + 0.1, 480, 300],
          [10.35, tabX.Outline, 22],
          [11.9, tabX.Outline, 22],
          [12.25, tabX.Brainstorm, 22],
          [13.6, tabX.Brainstorm, 22],
          [13.85, tabX['Split view'], 22],
        ],
        14.5,
      ),
      ripple(m, 10.45, tabX.Outline, 18),
      ripple(m, 12.35, tabX.Brainstorm, 18),
      ripple(m, 13.95, tabX['Split view'], 18),
    ]
    out.push(m.ag({ o: show(S[2], S[3]) }, parts))
    out.push(
      keys(m, addAt - 0.2, ['Enter'], { dur: 0.8 }),
      caption(
        m,
        S[2],
        S[3],
        'One project, three views',
        'The map as a canvas or an outline, a Brainstorm for quick ideas, or two side by side.',
      ),
    )
  }

  /* --- scene 3: rich nodes --- */
  {
    const root = N('Launch plan', 'root', { x: 48, cy: 300 })
    const pricing = N('Pricing', 'branch', { x: 250, cy: 170, measure: '🎯 Pricing', extra: 6 })
    const tiers = N('Tiers', 'leaf', { x: 440, cy: 170 })
    const tiersTall = N('Tiers', 'leaf', { x: 440, cy: 170, h: 46, w: 132 })
    const golive = N('Go-live checklist', 'branch', { x: 250, cy: 290, extra: 64 })
    const tasks = ['Write docs', 'Test payments', 'Book launch call'].map((t, i) =>
      N(t, 'leaf', { x: 530, cy: 240 + i * 50, extra: 32 }),
    )
    const brand = N('Brand', 'branch', { x: 250, cy: 420 })
    const hero = N('Hero image', 'leaf', { x: 420, cy: 420 })
    const heroTall = N('Hero image', 'leaf', { x: 420, top: 372, w: 132, h: 96 })
    const tagAt = 18.0
    const tickAt = 19.7
    const pasteAt = 20.8
    const parts = [
      edge(root, pricing),
      edge(root, golive),
      edge(root, brand),
      edge(pricing, tiers),
      ...tasks.map((k) => edge(golive, k)),
      drawNode(root),
      drawNode(golive),
      drawNode(brand),
      // Role, colour and marker on Pricing.
      drawNode(pricing, { label: false }),
      m.ag(
        { t: move(17.0, 17.3, [0, 0], [24, 0]) },
        text(pricing.x + 14, pricing.cy + 5, 'Pricing', { size: 14, weight: 600 }),
      ),
      m.ag({ o: on(17.0, 0.3) }, [
        rect(pricing.x + 4, pricing.y + 6, 4, pricing.h - 12, { rx: 2, fill: C.teal }),
        text(pricing.x + 13, pricing.cy + 5.5, '🎯', { size: 15 }),
      ]),
      m.ag(
        { o: on(16.4, 0.3), t: move(16.4, 16.7, [0, 4], [0, 0]) },
        pill(pricing.r - 50, pricing.y - 22, 'theme', {
          fill: C.blue,
          color: C.white,
          size: 10.5,
          h: 17,
          w: 46,
        }).svg,
      ),
      m.ag({ o: show(16.1, 17.8, 0.2) }, ring(pricing)),
      // Tags typed while renaming Tiers.
      drawNode(tiers),
      m.ag({ o: show(tagAt - 0.15, tagAt + 1.0, 0.1) }, [
        rect(tiers.x, tiers.y, 186, tiers.h, { rx: 8, fill: C.white, stroke: C.blue, sw: 2 }),
        text(tiers.x + 12, tiers.cy + 4.7, 'Tiers', { size: 13 }),
        typed(
          m,
          tiers.x + 12 + textWidth('Tiers ', 13),
          tiers.cy + 4.7,
          '#p1 #pricing',
          tagAt,
          tagAt + 0.5,
          {
            size: 13,
            fill: C.amber,
          },
        ),
      ]),
      m.ag({ o: on(tagAt + 0.95, 0.25) }, [
        drawNode(tiersTall, { ty: tiersTall.cy - 4 }),
        (() => {
          const a = tagChip(tiersTall.x + 12, tiersTall.cy + 3, '#p1')
          return a.svg + tagChip(tiersTall.x + 12 + a.w + 5, tiersTall.cy + 3, '#pricing').svg
        })(),
      ]),
      m.ag({ o: show(tagAt + 0.95, 19.4, 0.2) }, ring(tiersTall)),
      // Tasks: Ctrl+Enter ticks the last one.
      ...tasks.map((k, i) => {
        const tx = k.x + 36
        const done = [
          checkbox(k.x + 12, k.cy - 7, true),
          path(`M${tx - 2} ${k.cy}H${tx + textWidth(k.label, 13) + 2}`, {
            stroke: C.mute,
            sw: 1.5,
          }),
        ]
        return [
          drawNode(k, { dx: 24 }),
          checkbox(k.x + 12, k.cy - 7, false),
          i < 2 ? done.join('') : m.ag({ o: on(tickAt, 0.2) }, done),
        ].join('')
      }),
      (() => {
        const px = golive.r - 52
        const py = golive.cy - 10
        return [
          rect(px, py, 40, 20, { rx: 10, fill: C.tealSoft }),
          text(px + 20, py + 14.5, '2/3', {
            size: 12,
            weight: 700,
            fill: C.teal,
            anchor: 'middle',
          }),
          m.ag({ o: on(tickAt, 0.2) }, [
            rect(px, py, 40, 20, { rx: 10, fill: C.teal }),
            text(px + 20, py + 14.5, '3/3', {
              size: 12,
              weight: 700,
              fill: C.white,
              anchor: 'middle',
            }),
          ]),
        ].join('')
      })(),
      m.ag({ o: show(19.2, 20.4, 0.2) }, ring(tasks[2])),
      // A pasted picture on Hero image.
      edge(brand, hero),
      drawNode(hero),
      m.ag({ o: on(pasteAt, 0.3) }, [
        drawNode(heroTall, { label: false }),
        picture(heroTall.x + 10, heroTall.y + 10, 112, 54),
        text(heroTall.x + 12, heroTall.b - 12, 'Hero image', { size: 13 }),
        ring(heroTall),
      ]),
    ]
    out.push(m.ag({ o: show(S[3], S[4] + 0.9) }, parts))
    out.push(
      keys(m, tickAt - 0.25, ['Ctrl', 'Enter'], { dur: 1.0 }),
      keys(m, pasteAt - 0.3, ['Ctrl', 'V'], { dur: 1.0 }),
      caption(
        m,
        S[3],
        S[4],
        'Rich nodes',
        'Roles, colours, markers, tasks, #tags and pictures on any node.',
      ),
    )
  }

  /* --- scene 4: present with F5 --- */
  {
    const T = S[4]
    const map = sampleMap(290)
    const stage = { x: 40, y: 112, w: 880, h: 320, clip: { x: 1, y: 35, w: 958, h: 470 } }
    const steps = [
      { n: map.root, t: T + 1.0 },
      { n: map.pricing, t: T + 2.2 },
      { n: map.hiring, t: T + 3.4 },
      { n: map.tiers, t: T + 4.6 },
    ]
    out.push(
      m.ag({ o: show(T + 0.5, S[5], 0.4) }, [
        rect(0.5, 0.5, 959, 539, { rx: 14, fill: C.night }),
        presentStage(m, { tree: map.tree, order: map.order, steps, end: S[5], stage, hudY: 452 }),
      ]),
      keys(m, T + 0.3, ['F5'], { dur: 1.0 }),
      keys(m, T + 2.05, ['→'], { dur: 0.8 }),
      caption(
        m,
        T + 0.5,
        S[5],
        'Present it with F5',
        'The centre, then each branch clockwise, then into them. Earlier steps dim.',
        { dark: true },
      ),
    )
  }

  /* --- scene 5: install it, use it offline --- */
  {
    const T = S[5]
    const site = smallMap(420, 300)
    const app = smallMap(420, 280)
    const added = N('Pricing', 'branch', { x: 530, cy: 380 })
    const appAt = T + 1.1
    const addAt = T + 2.6
    out.push(
      m.ag({ o: show(S[5], S[6]) }, [
        m.ag({ o: show(T, appAt + 0.3, 0.3) }, [
          browser(60, 110, 840, 350, 'huduzhu.github.io/mindmap/'),
          installIcon(856, 123),
          site.svg,
        ]),
        m.ag({ o: on(appAt, 0.4), t: move(appAt, appAt + 0.5, about(480, 285, 0.9), [0, 0]) }, [
          appWindow(150, 110, 660, 350),
          tabs(m, 170, 152, [['Mind Map', appAt - 0.1, S[6]]]),
          app.svg,
          path('M151 426.5H809', { stroke: C.rule }),
          m.ag({ o: on(appAt + 0.7, 0.3) }, [
            path('M170 443a14 14 0 0 1 18 0M174 447a8 8 0 0 1 10 0', { stroke: C.amber, sw: 1.6 }),
            circle(179, 451, 1.6, { fill: C.amber }),
            path('M167 437L191 455', { stroke: C.amber, sw: 1.6 }),
            text(198, 449, 'Offline (changes stay on this device)', {
              size: 11.5,
              fill: C.amber,
              weight: 600,
            }),
          ]),
          drawnEdge(m, app.r, added, addAt, addAt + 0.3),
          newNode(m, added, addAt + 0.05),
          m.ag(
            { o: show(addAt + 0.7, addAt + 1.4, 0.15) },
            text(790, 449, 'Saving…', { size: 12, fill: C.mute, anchor: 'end' }),
          ),
          m.ag(
            { o: on(addAt + 1.4, 0.15) },
            text(790, 449, 'Saved', { size: 12, fill: C.teal, weight: 700, anchor: 'end' }),
          ),
        ]),
        pointer(
          m,
          [
            [T + 0.2, 520, 400],
            [T + 0.6, 864, 129],
          ],
          appAt,
        ),
        ripple(m, T + 0.7, 864, 129),
      ]),
      keys(m, addAt - 0.2, ['Tab'], { dur: 0.8 }),
      caption(
        m,
        S[5],
        S[6],
        'Install it, use it offline',
        'Your projects stay on your device: no account, no server.',
      ),
    )
  }

  /* --- scene 6: sync through a folder, and an AI round trip --- */
  {
    const T = S[6]
    const cols = [40, 370, 700]
    const W = 220
    const label = (y, value) => text(40, y, value, { size: 12, weight: 700, fill: C.blue })
    const dash = (x1, x2, y) => path(`M${x1} ${y}H${x2}`, { stroke: C.line, sw: 2, dash: '4 4' })
    const dot = (a, b, p, q, color = C.blue) =>
      m.ag(
        { o: show(a - 0.05, b + 0.15, 0.1), t: move(a, b, p, q) },
        circle(0, 0, 6, { fill: color }),
      )
    const doc = (label, color) =>
      [
        rect(-34, -16, 68, 32, { rx: 7, fill: C.white, stroke: color, sw: 1.5 }),
        fileIcon(-26, -8, color),
        text(-8, 4.5, label, { size: 11, weight: 700, fill: color, mono: true }),
      ].join('')
    const parts = [
      // Sync through a folder.
      label(124, 'Sync folder…'),
      miniApp(m, cols[0], 134, W, 100, 'Launch plan'),
      text(cols[0] + W / 2, 252, 'This computer', { size: 12, fill: C.mute, anchor: 'middle' }),
      mini(m, cols[0] + 30, 194, [[T + 0.3, C.teal]]),
      rect(cols[1], 134, W, 100, { rx: 9, fill: C.white, stroke: C.line }),
      folderIcon(cols[1] + 14, 146),
      text(cols[1] + 40, 160, 'OneDrive › MindMaps', { size: 12.5, weight: 700 }),
      fileIcon(cols[1] + 12, 184, C.mute),
      text(cols[1] + 30, 196, 'Launch plan (a1b2).mindmap.json', { size: 10.5 }),
      miniApp(m, cols[2], 134, W, 100, 'Launch plan'),
      text(cols[2] + W / 2, 252, 'Other computer', { size: 12, fill: C.mute, anchor: 'middle' }),
      mini(m, cols[2] + 30, 194, [[T + 2.2, C.teal]]),
      dash(cols[0] + W, cols[1], 184),
      dash(cols[1] + W, cols[2], 184),
      dot(T + 0.6, T + 1.2, [cols[0] + W, 184], [cols[1], 184]),
      dot(T + 1.5, T + 2.1, [cols[1] + W, 184], [cols[2], 184]),
      // An AI round trip.
      label(282, 'Export ▾ → For AI…'),
      rect(cols[0], 292, W, 130, { rx: 9, fill: C.white, stroke: C.line }),
      text(cols[0] + 16, 316, 'Launch plan', { size: 13, weight: 700 }),
      text(cols[0] + 16, 340, 'BRAINSTORM', { size: 10.5, weight: 700, fill: C.mute }),
      ...['Pricing ideas', 'Beta users', 'Launch event'].flatMap((t, i) => [
        circle(cols[0] + 20, 357 + i * 22, 3, { fill: C.blue }),
        text(cols[0] + 30, 361 + i * 22, t, { size: 12 }),
      ]),
      rect(cols[1], 292, W, 130, { rx: 9, fill: C.paper, stroke: C.line }),
      text(cols[1] + 16, 316, 'Your AI assistant', { size: 13, weight: 700 }),
      folderIcon(cols[1] + 16, 330),
      text(cols[1] + 40, 344, 'skill/', { size: 12, weight: 700, mono: true }),
      folderIcon(cols[1] + 110, 330),
      text(cols[1] + 134, 344, 'schemas/', { size: 12, weight: 700, mono: true }),
      text(cols[1] + 16, 380, 'No API key: the app never', { size: 11.5, fill: C.mute }),
      text(cols[1] + 16, 397, 'calls an AI itself.', { size: 11.5, fill: C.mute }),
      dash(cols[0] + W, cols[1], 330),
      dash(cols[1] + W, 680, 330),
      m.ag(
        {
          o: show(T + 2.3, T + 3.3, 0.2),
          t: move(T + 2.4, T + 3.1, [cols[0] + W + 20, 330], [cols[1] - 20, 330]),
        },
        doc('.json', C.blue),
      ),
      m.ag(
        {
          o: show(T + 3.3, T + 4.1, 0.2),
          t: move(T + 3.35, T + 4.0, [cols[1] + W + 20, 330], [cols[2] - 20, 330]),
        },
        doc('.json', C.teal),
      ),
      m.ag({ o: on(T + 4.0, 0.3), t: move(T + 4.0, T + 4.3, [0, 6], [0, 0]) }, [
        rect(680, 292, 240, 130, {
          rx: 9,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        text(694, 316, 'Import an AI mind map', { size: 13, weight: 700 }),
        rect(692, 330, 216, 44, { rx: 8, fill: C.blue }),
        text(702, 348, 'Put the map into “Launch plan”', { size: 11, weight: 700, fill: C.white }),
        text(702, 365, 'One Undo reverts it.', { size: 11, fill: C.blueSoft }),
        text(694, 402, 'Import as a new project', { size: 12, fill: C.mute }),
      ]),
    ]
    out.push(
      m.ag({ o: show(S[6], S[7]) }, parts),
      caption(
        m,
        S[6],
        S[7],
        'Sync and AI, on your terms',
        'Sync through a folder you choose. Hand an AI assistant a file; no API key.',
      ),
    )
  }

  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
