/** docs/pwa-offline.svg: install as an app, work offline, and take an update when you choose. */
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
  keys,
  move,
  on,
  path,
  pointer,
  progressBar,
  rect,
  ripple,
  show,
  text,
  textWidth,
  typed,
  windowBack,
} from '../svg-movie.mjs'
import { browser, button } from './ui.mjs'

/** The app's own window (installed: no address bar), with view tabs. */
export function appWindow(x, y, w, h) {
  return [
    rect(x, y, w, h, { rx: 10, fill: C.white, stroke: C.line }),
    path(`M${x + 1} ${y + 32.5}H${x + w - 1}`, { stroke: C.rule }),
    rect(x + 12, y + 9, 15, 15, { rx: 4, fill: C.blue }),
    text(x + 36, y + 21.5, 'Mind Map Studio', { size: 12.5, weight: 600, fill: C.mute }),
  ].join('')
}

const TABS = ['Mind Map', 'Brainstorm', 'Outline']

export function tabs(m, x, y, windows) {
  const parts = []
  let tx = x
  TABS.forEach((t) => {
    const w = textWidth(t, 12, 600) + 20
    parts.push(
      rect(tx, y, w, 24, { rx: 6, fill: C.white, stroke: C.line }),
      text(tx + w / 2, y + 16.5, t, { size: 12, weight: 600, fill: C.mute, anchor: 'middle' }),
    )
    for (const [name, a, b] of windows)
      if (name === t)
        parts.push(
          m.ag({ o: show(a, b, 0.15) }, [
            rect(tx, y, w, 24, { rx: 6, fill: C.blue }),
            text(tx + w / 2, y + 16.5, t, {
              size: 12,
              weight: 600,
              fill: C.white,
              anchor: 'middle',
            }),
          ]),
        )
    tx += w + 5
  })
  return parts.join('')
}

/** A small map: Launch plan with two branches. */
export function map(cx, cy) {
  const r = N('Launch plan', 'root', { center: cx, cy })
  const a = N('Audience', 'branch', { x: cx + 110, cy: cy - 45 })
  const b = N('Channels', 'branch', { x: cx + 110, cy: cy + 45 })
  return {
    r,
    a,
    b,
    svg: [edge(r, a), edge(r, b), drawNode(r), drawNode(a), drawNode(b)].join(''),
  }
}

/** The install icon at the right of the address bar. */
export const installIcon = (x, y) =>
  [
    rect(x, y, 16, 11, { rx: 2, stroke: C.mute, sw: 1.4 }),
    path(`M${x + 8} ${y + 2}v6m-3 -3l3 3l3 -3`, { stroke: C.mute, sw: 1.4 }),
  ].join('')

export function pwaOffline() {
  const S = [0, 6.4, 13.2, 19.6]
  const m = new Movie({
    id: 'pw',
    width: 960,
    height: 480,
    duration: S[3],
    poster: 10.0,
    title: 'Mind Map Studio: install it as an app, work offline, update when you choose',
    desc:
      'A looping animation in three scenes. 1: in Chrome or Edge the install icon at the right of the address bar installs Mind Map Studio, which then opens in its own window. ' +
      '2: with the network off the app shows Offline (changes stay on this device); a node is added, the views switch between Mind Map, Outline and Brainstorm, and after a reload everything is still there, because the service worker caches every file of the app. ' +
      '3: back online, a banner says A new version of Mind Map Studio is ready, with Reload and Later; Reload saves the open project first and then reloads.',
  })
  const out = [windowBack(m)]

  /* --- scene 1: install from the address bar --- */
  {
    const icon = installIcon
    const site = map(400, 290)
    const parts = [
      m.ag({ o: show(S[0], 3.4, 0.3) }, [
        browser(60, 104, 840, 340, 'huduzhu.github.io/mindmap/'),
        icon(856, 117),
        site.svg,
        m.ag({ o: show(1.5, 3.2, 0.2), t: move(1.5, 1.75, [0, -6], [0, 0]) }, [
          rect(600, 150, 290, 116, {
            rx: 10,
            fill: C.white,
            stroke: C.line,
            filter: `url(#${m.id}-shadow)`,
          }),
          rect(618, 168, 30, 30, { rx: 7, fill: C.blue }),
          text(660, 181, 'Install app?', { size: 13.5, weight: 700 }),
          text(660, 199, 'Mind Map Studio', { size: 12.5, fill: C.mute }),
          button(702, 222, 'Install', { primary: true, w: 80 }).svg,
          button(788, 222, 'Cancel', { w: 84 }).svg,
        ]),
      ]),
      m.ag({ o: on(3.5, 0.4), t: move(3.5, 4.0, about(480, 280, 0.9), [0, 0]) }, [
        appWindow(150, 104, 660, 340),
        map(400, 290).svg,
      ]),
      pointer(
        m,
        [
          [0.6, 500, 420],
          [1.2, 864, 123],
          [1.9, 864, 123],
          [2.4, 742, 236],
        ],
        3.3,
      ),
      ripple(m, 1.3, 864, 123),
      ripple(m, 2.5, 742, 236),
    ]
    out.push(m.ag({ o: show(S[0], S[1]) }, parts))
    out.push(
      caption(
        m,
        S[0],
        S[1],
        'Install it as an app',
        'Chrome or Edge: the install icon in the address bar. It opens in its own window.',
      ),
    )
  }

  /* --- scene 2: offline --- */
  {
    const T0 = S[1]
    const site = map(360, 270)
    const c = N('Pricing', 'branch', { x: 470, cy: 365 })
    const reload = [T0 + 4.7, T0 + 5.4]
    const content = [
      site.svg,
      drawnEdge(m, site.r, c, T0 + 1.3, T0 + 1.6),
      m.ag({ o: on(T0 + 1.35, 0.2) }, [
        rect(c.x, c.y, c.w, c.h, { rx: 9, fill: C.white, stroke: C.blue, sw: 1.5 }),
        typed(m, c.x + 14, c.cy + 5, 'Pricing', T0 + 1.5, T0 + 1.9, { size: 14, weight: 600 }),
      ]),
    ]
    const outline = [
      ['Launch plan', 0],
      ['Audience', 1],
      ['Channels', 1],
      ['Pricing', 1],
    ].map(([t, l], i) => text(200 + l * 24, 220 + i * 32, t, { size: 14, weight: l ? 400 : 700 }))
    const brainstorm = ['Webinar idea', 'Launch week checklist'].map((t, i) =>
      [
        circle(204, 216 + i * 32, 3.5, { fill: C.blue }),
        text(218, 221 + i * 32, t, { size: 14 }),
      ].join(''),
    )
    const parts = [
      appWindow(150, 104, 660, 340),
      tabs(m, 170, 146, [
        ['Mind Map', T0 - 0.1, T0 + 2.4],
        ['Outline', T0 + 2.4, T0 + 3.2],
        ['Brainstorm', T0 + 3.2, T0 + 4.0],
        ['Mind Map', T0 + 4.0, S[2]],
      ]),
      m.ag({ o: show(T0 + 0.5, S[2], 0.3) }, [
        path(`M530 160a14 14 0 0 1 18 0M534 164a8 8 0 0 1 10 0`, { stroke: C.amber, sw: 1.6 }),
        circle(539, 168, 1.6, { fill: C.amber }),
        path('M527 154L551 172', { stroke: C.amber, sw: 1.6 }),
        text(558, 163, 'Offline (changes stay on this device)', {
          size: 11.5,
          fill: C.amber,
          weight: 600,
        }),
      ]),
      m.ag(
        {
          o: [
            [T0 + 2.4, 1],
            [T0 + 2.55, 0],
            [T0 + 4.0, 0],
            [T0 + 4.15, 1],
            [reload[0], 1],
            [reload[0] + 0.15, 0],
            [reload[1], 0],
            [reload[1] + 0.25, 1],
          ],
        },
        content,
      ),
      m.ag({ o: show(T0 + 2.4, T0 + 3.25, 0.15) }, outline),
      m.ag({ o: show(T0 + 3.2, T0 + 4.05, 0.15) }, brainstorm),
      m.ag(
        { o: show(reload[0] + 0.1, reload[1] + 0.1, 0.1) },
        text(480, 300, 'Reloading…', { size: 14, fill: C.mute, anchor: 'middle' }),
      ),
      m.ag({ o: show(reload[1] + 0.3, S[2], 0.3) }, [
        rect(170, 400, 300, 28, { rx: 14, fill: C.tealSoft }),
        text(320, 418.5, 'Everything is still here after the reload', {
          size: 12,
          weight: 600,
          fill: C.teal,
          anchor: 'middle',
        }),
      ]),
    ]
    out.push(m.ag({ o: show(S[1], S[2]) }, parts))
    out.push(
      keys(m, T0 + 1.1, ['Tab'], { dur: 0.6 }),
      keys(m, reload[0] - 0.2, ['Ctrl', 'R'], { dur: 0.9 }),
    )
    out.push(
      caption(
        m,
        S[1],
        S[2],
        'Fully offline',
        'Its service worker caches every file of the app; projects live in the browser.',
      ),
    )
  }

  /* --- scene 3: the update banner --- */
  {
    const T0 = S[2]
    const site = map(400, 310)
    const reloadAt = T0 + 2.6
    const parts = [
      appWindow(150, 104, 660, 340),
      tabs(m, 170, 146, [['Mind Map', T0 - 0.1, S[3]]]),
      m.ag(
        {
          o: [
            [reloadAt + 0.6, 1],
            [reloadAt + 0.75, 0],
            [reloadAt + 1.3, 0],
            [reloadAt + 1.55, 1],
          ],
        },
        site.svg,
      ),
      text(790, 163, 'Saved', { size: 12, fill: C.teal, weight: 700, anchor: 'end' }),
      m.ag(
        { o: show(T0 + 0.6, reloadAt + 0.7, 0.25), t: move(T0 + 0.6, T0 + 0.9, [0, -10], [0, 0]) },
        [
          rect(170, 182, 620, 44, { rx: 9, fill: C.blueSoft, stroke: C.blue }),
          text(188, 209, 'A new version of Mind Map Studio is ready.', {
            size: 13.5,
            weight: 600,
            fill: C.ink,
          }),
          button(624, 190, 'Reload', { primary: true, w: 74 }).svg,
          m.ag(
            { o: on(reloadAt, 0.1) },
            button(624, 190, 'Reloading…', { primary: true, w: 74, size: 11 }).svg,
          ),
          button(704, 190, 'Later', { w: 70 }).svg,
        ],
      ),
      m.ag({ o: show(reloadAt + 0.1, reloadAt + 0.9, 0.15) }, [
        rect(560, 400, 230, 28, { rx: 14, fill: C.tealSoft }),
        text(675, 418.5, 'Saving the open project first', {
          size: 12,
          weight: 600,
          fill: C.teal,
          anchor: 'middle',
        }),
      ]),
      pointer(
        m,
        [
          [T0 + 1.6, 520, 420],
          [reloadAt - 0.2, 660, 204],
        ],
        reloadAt + 0.6,
      ),
      ripple(m, reloadAt, 660, 204),
    ]
    out.push(m.ag({ o: show(S[2], S[3]) }, parts))
    out.push(
      caption(
        m,
        S[2],
        S[3],
        'Updates when you choose',
        'A banner offers the new version; Reload saves your work, then reloads.',
      ),
    )
  }

  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
