/** docs/export-and-share.svg: drop to import, export what you see, the HTML page, GitHub milestones. */
import {
  C,
  Movie,
  N,
  about,
  caption,
  drawNode,
  edge,
  g,
  kbd,
  keys,
  move,
  off,
  on,
  pill,
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
import { browser, button, fileIcon, picture, tagChip, toast } from './ui.mjs'

export function exportAndShare() {
  const S = [0, 5.8, 11.8, 17.8, 24]
  const m = new Movie({
    id: 'es',
    width: 960,
    height: 500,
    duration: S[4],
    poster: 9.6,
    title: 'Mind Map Studio: import, export and share',
    desc:
      'A looping animation in four scenes. 1: a project ZIP is dragged onto the window and dropped, and the project opens with its map and picture. ' +
      '2: the map is focused on the branch Launch Plan with the tag filter #p1 set to hide other nodes; Export, PNG image saves a picture of just the two visible nodes under Launch Plan. ' +
      '3: an exported HTML page opened from a file: the ✎ marker opens a node’s notes, Esc closes them, the map zooms, and a thumbnail opens full size. ' +
      '4: GitHub milestones saves the project to a private repository with the message Pricing tiers agreed and the tag v1-plan, and History restores a milestone as a snapshot.',
  })
  const out = [windowBack(m)]

  /* --- scene 1: drop a file anywhere --- */
  {
    const r = N('Launch plan', 'root', { center: 420, cy: 290 })
    const a = N('Audience', 'branch', { x: 560, cy: 220 })
    const b = N('Channels', 'branch', { x: 560, cy: 290 })
    const pic = N('Hero image', 'leaf', { x: 560, top: 322, w: 110, h: 86 })
    const kids = [a, b, pic]
    const file = [
      rect(-56, -22, 112, 44, {
        rx: 9,
        fill: C.white,
        stroke: C.blue,
        sw: 1.5,
        filter: `url(#${m.id}-shadow)`,
      }),
      fileIcon(-44, -8, C.blue),
      text(-24, 5, 'plan.zip', { size: 12.5, weight: 700, fill: C.blue, mono: true }),
    ]
    const parts = [
      m.ag(
        { o: show(1.2, 2.5, 0.2) },
        rect(16, 42, 928, 420, {
          rx: 12,
          fill: C.blueSoft,
          fillOpacity: 0.35,
          stroke: C.blue,
          sw: 2.5,
          dash: '10 7',
        }),
      ),
      m.ag({ o: show(0.3, 2.6, 0.2), t: move(0.4, 1.8, [880, 470], [480, 300]) }, file),
      pointer(
        m,
        [
          [0.4, 900, 480],
          [1.8, 500, 318],
        ],
        2.6,
      ),
    ]
    parts.push(
      m.ag({ o: on(2.6, 0.4) }, [
        rect(24, 104, 912, 40, { rx: 10, fill: C.paper, stroke: C.rule }),
        text(42, 129, 'Launch plan', { size: 15, weight: 700 }),
        text(916, 129, 'Imported', { size: 12.5, fill: C.teal, anchor: 'end', weight: 700 }),
        ...kids.map((k) => edge(r, k)),
        drawNode(r),
        drawNode(a),
        drawNode(b),
        drawNode(pic, { label: false }),
        picture(pic.x + 9, pic.y + 8, 92, 50),
        text(pic.x + 11, pic.b - 11, 'Hero image', { size: 12.5 }),
      ]),
    )
    out.push(m.ag({ o: show(S[0], S[1]) }, parts))
    out.push(
      caption(
        m,
        S[0],
        S[1],
        'Drop to import',
        'Drop a project, a ZIP with pictures, or a Markdown outline onto the app.',
      ),
    )
  }

  /* --- scene 2: focused, filtered, exported --- */
  {
    const T0 = S[1]
    const lp = N('Launch Plan', 'root', { center: 330, cy: 300 })
    const beta = N('Beta list', 'leaf', { x: 470, cy: 230, extra: 34 })
    const press = N('Press kit', 'leaf', { x: 470, cy: 300 })
    const pricing = N('Pricing', 'leaf', { x: 470, cy: 370, extra: 34 })
    const hideAt = T0 + 1.3
    const parts = [
      // Breadcrumb bar (focus) and the tag filter.
      rect(24, 104, 912, 34, { rx: 8, fill: C.paper, stroke: C.rule }),
      text(40, 126, 'Product launch', { size: 13.5, fill: C.blue, weight: 600 }),
      text(146, 126, '›', { size: 15, fill: C.faint }),
      text(162, 126, 'Launch Plan', { size: 13.5, weight: 700 }),
      m.ag(
        { o: on(T0 + 0.8, 0.3) },
        pill(560, 112, 'Tag filter: #p1 · Hide', {
          fill: C.amberSoft,
          color: C.amber,
          size: 11.5,
          h: 20,
        }).svg,
      ),
      button(830, 108, 'Export ▾', { size: 12.5, w: 92, h: 26 }).svg,
      edge(lp, beta),
      edge(lp, pricing),
      drawNode(lp),
      drawNode(beta),
      drawNode(pricing),
      tagChip(beta.r - 38, beta.cy - 8, '#p1').svg,
      tagChip(pricing.r - 38, pricing.cy - 8, '#p1').svg,
      m.ag({ o: off(hideAt, 0.4) }, [edge(lp, press), drawNode(press)]),
    ]
    const menu = [
      'Project JSON (.json)',
      'Markdown outline (.md)',
      'PNG image',
      'SVG image',
      'Print / save as PDF…',
    ]
    parts.push(
      m.ag({ o: show(T0 + 2.1, T0 + 3.2, 0.15) }, [
        rect(726, 138, 196, 8 + menu.length * 28, {
          rx: 9,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        m.ag(
          { o: on(T0 + 2.65, 0.1) },
          rect(730, 142 + 2 * 28, 188, 26, { rx: 6, fill: C.blueSoft }),
        ),
        ...menu.map((t, i) => text(742, 160 + i * 28, t, { size: 12.5 })),
      ]),
    )
    // The exported PNG: just what the map shows.
    const png = [
      rect(640, 196, 280, 200, {
        rx: 10,
        fill: C.white,
        stroke: C.line,
        filter: `url(#${m.id}-shadow)`,
      }),
      rect(652, 208, 256, 150, { rx: 6, fill: C.paper }),
      g({ transform: 'translate(652 208) scale(0.5) translate(-200 -150)' }, [
        edge(lp, beta),
        edge(lp, pricing),
        drawNode(lp),
        drawNode(beta),
        drawNode(pricing),
      ]),
      fileIcon(654, 368, C.blue),
      text(674, 381, 'PNG image: just what the map shows', {
        size: 11.5,
        fill: C.ink,
        weight: 600,
      }),
    ]
    parts.push(
      m.ag(
        { o: on(T0 + 3.3, 0.35), t: move(T0 + 3.3, T0 + 3.7, about(780, 296, 0.85), [0, 0]) },
        png,
      ),
    )
    parts.push(
      pointer(
        m,
        [
          [T0 + 1.6, 600, 420],
          [T0 + 2.0, 876, 121],
          [T0 + 2.3, 876, 121],
          [T0 + 2.55, 790, 212],
        ],
        T0 + 3.2,
      ),
      ripple(m, T0 + 2.05, 876, 121),
      ripple(m, T0 + 2.7, 790, 212),
    )
    out.push(m.ag({ o: show(S[1], S[2]) }, parts))
    out.push(
      caption(
        m,
        S[1],
        S[2],
        'Export what you see',
        'PNG, SVG and print frame the focused branch, without nodes a tag filter hides.',
      ),
    )
  }

  /* --- scene 3: the interactive HTML page --- */
  {
    const T0 = S[2]
    const r = N('Launch plan', 'root', { center: 360, cy: 300 })
    const a = N('Audience', 'branch', { x: 500, cy: 220, extra: 22 })
    const b = N('Channels', 'branch', { x: 500, cy: 300 })
    const pic = N('Hero image', 'leaf', { x: 500, top: 332, w: 110, h: 86 })
    const mapParts = [
      edge(r, a),
      edge(r, b),
      edge(r, pic),
      drawNode(r),
      drawNode(a),
      text(a.r - 20, a.cy + 5, '✎', { size: 14, fill: C.blue, weight: 700 }),
      drawNode(b),
      drawNode(pic, { label: false }),
      picture(pic.x + 9, pic.y + 8, 92, 50),
      text(pic.x + 11, pic.b - 11, 'Hero image', { size: 12.5 }),
    ]
    const zoom = [
      [T0 + 3.0, [0, 0, 1]],
      [T0 + 3.6, about(480, 300, 1.15)],
      [T0 + 4.2, about(480, 300, 1.15)],
      [T0 + 4.6, [0, 0, 1]],
    ]
    const parts = [
      browser(40, 104, 880, 362, 'launch-plan.html · opened from a file', {
        filter: `url(#${m.id}-shadow)`,
      }),
      rect(41, 145, 878, 320, { fill: C.paper }),
      m.ag({ t: zoom }, mapParts),
      m.ag({ o: show(T0 + 1.0, T0 + 2.4, 0.2), t: move(T0 + 1.0, T0 + 1.3, [0, 6], [0, 0]) }, [
        rect(640, 160, 260, 120, {
          rx: 10,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        text(658, 186, 'Audience', { size: 14, weight: 700 }),
        text(658, 210, 'Students and small teams.', { size: 13 }),
        text(658, 232, 'Interview five of each first.', { size: 13 }),
        kbd(658, 248, 'Esc').svg,
        text(696, 262, 'closes', { size: 11.5, fill: C.mute }),
      ]),
      m.ag({ o: show(T0 + 4.9, S[3], 0.25) }, [
        rect(41, 145, 878, 320, { fill: C.ink, fillOpacity: 0.97 }),
        m.ag(
          { t: move(T0 + 4.9, T0 + 5.3, about(480, 300, 0.4), [0, 0]) },
          picture(330, 200, 300, 168),
        ),
      ]),
      pointer(
        m,
        [
          [T0 + 0.3, 300, 420],
          [T0 + 0.75, a.r - 14, a.cy + 2],
          [T0 + 2.7, a.r - 14, a.cy + 2],
          [T0 + 3.0, 700, 380],
          [T0 + 4.3, 700, 380],
          [T0 + 4.7, pic.cx, pic.y + 32],
        ],
        T0 + 5.0,
      ),
      ripple(m, T0 + 0.85, a.r - 14, a.cy + 2),
      ripple(m, T0 + 4.8, pic.cx, pic.y + 32),
    ]
    out.push(m.ag({ o: show(S[2], S[3]) }, parts))
    out.push(keys(m, T0 + 2.3, ['Esc'], { dur: 0.7 }))
    out.push(
      caption(
        m,
        S[2],
        S[3],
        'A self-contained HTML page',
        'Notes, zoom and pictures in one file that loads nothing from the network.',
      ),
    )
  }

  /* --- scene 4: GitHub milestones --- */
  {
    const T0 = S[3]
    const tabs = ['Save milestone', 'History', 'Settings']
    const tabX = [262]
    tabs.forEach((t, i) => tabX.push(tabX[i] + textWidth(t, 12.5, 600) + 28))
    const tab = (i, active) =>
      [
        rect(tabX[i], 196, tabX[i + 1] - tabX[i] - 6, 26, {
          rx: 7,
          fill: active ? C.blue : C.white,
          stroke: active ? C.blue : C.line,
        }),
        text((tabX[i] + tabX[i + 1] - 6) / 2, 213.5, tabs[i], {
          size: 12.5,
          weight: 600,
          fill: active ? C.white : C.mute,
          anchor: 'middle',
        }),
      ].join('')
    const parts = [
      rect(240, 150, 480, 296, {
        rx: 12,
        fill: C.white,
        stroke: C.line,
        filter: `url(#${m.id}-shadow)`,
      }),
      text(262, 180, 'GitHub milestones', { size: 15, weight: 700 }),
      tab(0, false),
      tab(1, false),
      tab(2, false),
      m.ag({ o: show(T0 - 0.1, T0 + 3.4, 0.15) }, tab(0, true)),
      m.ag({ o: on(T0 + 3.4, 0.15) }, tab(1, true)),
      m.ag({ o: show(T0 - 0.1, T0 + 3.5, 0.2) }, [
        text(
          262,
          246,
          'Saves “Launch plan” to your-name/mindmap-backups as a commit you can come back to.',
          { size: 11.5, fill: C.mute },
        ),
        text(262, 272, 'What changed', { size: 12, weight: 700, fill: C.mute }),
        rect(262, 280, 436, 30, { rx: 7, fill: C.white, stroke: C.line }),
        typed(m, 274, 300, 'Pricing tiers agreed', T0 + 0.5, T0 + 1.1, { size: 13 }),
        text(262, 334, 'Tag (optional)', { size: 12, weight: 700, fill: C.mute }),
        rect(262, 342, 200, 30, { rx: 7, fill: C.white, stroke: C.line }),
        typed(m, 274, 362, 'v1-plan', T0 + 1.3, T0 + 1.6, { size: 13, mono: true }),
        button(262, 392, 'Save milestone', { primary: true }).svg,
      ]),
      m.ag({ o: on(T0 + 3.5, 0.25) }, [
        rect(262, 238, 436, 58, { rx: 8, fill: C.paper, stroke: C.rule }),
        text(278, 262, 'Pricing tiers agreed', { size: 13.5, weight: 600 }),
        tagChip(278, 272, 'v1-plan', 10.5).svg,
        text(340, 284, 'today · 3f9c2a1', { size: 11.5, fill: C.mute }),
        button(548, 252, 'Restore as snapshot', { size: 12, h: 28 }).svg,
        rect(262, 306, 436, 58, { rx: 8, fill: C.paper, stroke: C.rule }),
        text(278, 330, 'First outline', { size: 13.5, weight: 600 }),
        text(278, 352, 'last week · 8be41d0', { size: 11.5, fill: C.mute }),
        button(548, 320, 'Restore as snapshot', { size: 12, h: 28 }).svg,
      ]),
      m.ag(
        { o: show(T0 + 2.0, T0 + 3.3, 0.2) },
        toast(480, 446, 'Milestone saved to GitHub (3f9c2a1).'),
      ),
      m.ag(
        { o: show(T0 + 4.6, S[4], 0.25) },
        toast(
          480,
          410,
          'Added snapshot “GitHub 2026-10-24 (3f9c2a1)”. Open Project ▾ → Snapshots to restore it.',
          { size: 12 },
        ),
      ),
      pointer(
        m,
        [
          [T0 + 1.6, 600, 430],
          [T0 + 1.9, 320, 406],
          [T0 + 2.8, 320, 406],
          [T0 + 3.2, 395, 209],
          [T0 + 3.7, 395, 209],
          [T0 + 4.2, 620, 266],
        ],
        T0 + 5.0,
      ),
      ripple(m, T0 + 1.95, 320, 406),
      ripple(m, T0 + 3.3, 395, 209),
      ripple(m, T0 + 4.3, 620, 266),
    ]
    out.push(m.ag({ o: show(S[3], S[4]) }, parts))
    out.push(
      caption(
        m,
        S[3],
        S[4],
        'GitHub milestones',
        'Save a project to your private repository as a commit, optionally tagged.',
      ),
    )
  }

  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
