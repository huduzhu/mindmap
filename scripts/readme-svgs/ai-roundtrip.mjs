/** docs/ai-roundtrip.svg: the three intents, then the packet → assistant → reply round trip. */
import {
  C,
  Movie,
  N,
  caption,
  circle,
  drawNode,
  drawnEdge,
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
  windowBack,
} from '../svg-movie.mjs'
import { card, fileIcon, folderIcon } from './ui.mjs'

export function aiRoundtrip() {
  const S = [0, 6.6, 16.2]
  const m = new Movie({
    id: 'ai',
    width: 960,
    height: 480,
    duration: S[2],
    poster: 15.6,
    title: 'Mind Map Studio: working with an AI assistant, without an API key',
    desc:
      'A looping animation in two scenes. 1: the three things you can ask for: expand adds more ideas to the brainstorm (append-only), convert turns the brainstorm into a structured mind map, and improve sharpens titles, grouping and notes in both. ' +
      '2: Export, For AI… makes a packet with the convert intent. Your AI assistant uses the skill folder and checks its reply against the schemas folder. ' +
      'Importing the reply offers Put the map into Launch plan; the new map appears, and one Undo reverts it.',
  })
  const out = [windowBack(m)]
  const status = (a, b, value) =>
    m.ag(
      { o: show(a, b, 0.3) },
      text(480, 446, value, { size: 14, fill: C.ink, anchor: 'middle', weight: 600 }),
    )

  /* --- scene 1: the three intents --- */
  {
    const parts = []
    const col = (i) => 40 + i * 300
    const heads = [
      ['expand', 'More ideas for the brainstorm (append-only)'],
      ['convert', 'Brainstorm → a structured mind map'],
      ['improve', 'Sharper titles, grouping and notes in both'],
    ]
    heads.forEach(([name, sub], i) => {
      const x = col(i)
      const a = 0.3 + i * 1.7
      parts.push(
        m.ag({ o: on(a, 0.35), t: move(a, a + 0.35, [0, 8], [0, 0]) }, [
          card(x, 110, 280, 300, ''),
          text(x + 18, 140, name, { size: 17, weight: 700, mono: true, fill: C.blue }),
          text(x + 18, 162, sub, { size: 12, fill: C.mute }),
        ]),
      )
    })
    // expand: two new bullets appended (teal).
    {
      const x = col(0) + 22
      const a = 0.3
      ;['Pricing ideas', 'Beta users', 'Launch event'].forEach((t, i) =>
        parts.push(
          m.ag({ o: on(a, 0.35) }, [
            circle(x + 4, 200 + i * 28, 3, { fill: C.blue }),
            text(x + 16, 205 + i * 28, t, { size: 13 }),
          ]),
        ),
      )
      ;['Student discount', 'Referral rewards'].forEach((t, i) =>
        parts.push(
          m.ag(
            {
              o: on(a + 0.9 + i * 0.35, 0.3),
              t: move(a + 0.9 + i * 0.35, a + 1.2 + i * 0.35, [-8, 0], [0, 0]),
            },
            [
              circle(x + 4, 284 + i * 28, 3, { fill: C.teal }),
              text(x + 16, 289 + i * 28, t, { size: 13, fill: C.teal, weight: 600 }),
            ],
          ),
        ),
      )
    }
    // convert: bullets become a map.
    {
      const x = col(1)
      const a = 2.0
      const r = N('Launch', 'root', { x: x + 20, cy: 290, w: 76 })
      const kids = ['Pricing', 'Beta', 'Event'].map((t, i) =>
        N(t, 'leaf', { x: x + 150, cy: 230 + i * 60, w: 100 }),
      )
      parts.push(
        m.ag(
          { o: show(a, a + 0.9, 0.25) },
          ['Pricing ideas', 'Beta users', 'Launch event'].map((t, i) =>
            [
              circle(x + 26, 200 + i * 28, 3, { fill: C.blue }),
              text(x + 38, 205 + i * 28, t, { size: 13 }),
            ].join(''),
          ),
        ),
      )
      parts.push(m.ag({ o: on(a + 0.8, 0.3) }, drawNode(r)))
      kids.forEach((k, i) =>
        parts.push(
          drawnEdge(m, r, k, a + 0.9 + i * 0.1, a + 1.3 + i * 0.1, { stroke: C.teal }),
          m.ag({ o: on(a + 1.1 + i * 0.1, 0.25) }, [
            rect(k.x, k.y, k.w, k.h, { rx: 8, fill: C.tealSoft, stroke: C.teal }),
            text(k.x + 12, k.cy + 4.6, k.label, { size: 13 }),
          ]),
        ),
      )
    }
    // improve: a vague title is sharpened and gets a note.
    {
      const x = col(2) + 22
      const a = 3.7
      parts.push(
        m.ag({ o: on(a, 0.35) }, [rect(x, 196, 236, 34, { rx: 8, fill: C.white, stroke: C.line })]),
      )
      parts.push(
        m.ag(
          {
            o: [
              [a, 0],
              [a + 0.35, 1],
              [a + 1.0, 1],
              [a + 1.3, 0],
            ],
          },
          text(x + 12, 218, 'pricing stuff??', { size: 13.5 }),
        ),
      )
      parts.push(
        m.ag({ o: on(a + 1.2, 0.3) }, [
          rect(x, 196, 236, 34, { rx: 8, fill: C.tealSoft, stroke: C.teal }),
          text(x + 12, 218, 'Pricing tiers', { size: 13.5, weight: 600 }),
        ]),
      )
      parts.push(
        m.ag({ o: on(a + 1.6, 0.3) }, [
          text(x, 256, 'NOTES', { size: 10.5, weight: 700, fill: C.mute }),
          text(x, 276, 'Free, Team and Business;', { size: 12.5, fill: C.teal }),
          text(x, 294, 'compare with two rivals.', { size: 12.5, fill: C.teal }),
        ]),
      )
    }
    parts.push(status(0.3, S[1], 'Pick what you want from the AI: expand, convert or improve.'))
    out.push(m.ag({ o: show(S[0], S[1]) }, parts))
    out.push(
      caption(
        m,
        S[0],
        S[1],
        'Three things to ask for',
        'Expand the brainstorm, convert it to a map, or improve both.',
      ),
    )
  }

  /* --- scene 2: the AI round trip --- */
  {
    const T0 = S[1]
    const parts = []
    // The app.
    parts.push(rect(40, 110, 340, 310, { rx: 12, fill: C.white, stroke: C.line }))
    parts.push(text(58, 138, 'Launch plan', { size: 14, weight: 700 }))
    parts.push(
      rect(296, 122, 68, 26, { rx: 7, fill: C.white, stroke: C.line }),
      text(330, 139.5, 'Export ▾', { size: 12.5, weight: 600, fill: C.mute, anchor: 'middle' }),
    )
    parts.push(
      m.ag({ o: show(T0 + 0.4, T0 + 1.5, 0.15) }, [
        rect(296, 122, 68, 26, { rx: 7, fill: C.blue }),
        text(330, 139.5, 'Export ▾', { size: 12.5, weight: 600, fill: C.white, anchor: 'middle' }),
      ]),
    )
    parts.push(path('M41 156.5H379', { stroke: C.rule }))
    parts.push(text(58, 180, 'BRAINSTORM', { size: 11, weight: 700, fill: C.mute }))
    ;['Pricing ideas', 'Beta users', 'Launch event', 'Press list'].forEach((t, i) =>
      parts.push(
        circle(64, 201 + i * 26, 3, { fill: C.blue }),
        text(76, 205 + i * 26, t, { size: 13 }),
      ),
    )
    parts.push(text(208, 180, 'MIND MAP', { size: 11, weight: 700, fill: C.mute }))
    const mr = { x: 208, y: 270, w: 66, h: 26, cx: 241, cy: 283, r: 274, b: 296 }
    parts.push(
      rect(mr.x, mr.y, mr.w, mr.h, { rx: 7, fill: C.blue }),
      text(mr.cx, mr.cy + 4.5, 'Launch', {
        size: 12,
        weight: 700,
        fill: C.white,
        anchor: 'middle',
      }),
    )
    const grow = T0 + 7.0
    ;['Pricing', 'Beta', 'Event', 'Press'].forEach((t, i) => {
      const k = {
        x: 294,
        y: 205 + i * 44,
        w: 70,
        h: 24,
        cx: 329,
        cy: 217 + i * 44,
        r: 364,
        b: 229 + i * 44,
      }
      parts.push(drawnEdge(m, mr, k, grow + i * 0.12, grow + 0.4 + i * 0.12, { stroke: C.teal }))
      parts.push(
        m.ag({ o: on(grow + 0.25 + i * 0.12, 0.3) }, [
          rect(k.x, k.y, k.w, k.h, { rx: 6, fill: C.tealSoft, stroke: C.teal }),
          text(k.x + 10, k.cy + 4.5, t, { size: 12 }),
        ]),
      )
    })
    // Export menu, then the "Export for AI" dialog.
    const menu = ['Project JSON (.json)', 'Markdown outline (.md)', 'PNG image', 'For AI…']
    parts.push(
      m.ag({ o: show(T0 + 0.45, T0 + 1.6, 0.15) }, [
        rect(170, 152, 194, 4 + menu.length * 28, {
          rx: 9,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        m.ag(
          { o: on(T0 + 1.0, 0.1) },
          rect(174, 156 + 3 * 28, 186, 26, { rx: 6, fill: C.blueSoft }),
        ),
        ...menu.map((t, i) =>
          text(186, 174 + i * 28, t, { size: 12.5, weight: t === 'For AI…' ? 700 : 400 }),
        ),
      ]),
    )
    const intents = [
      ['expand', 'more ideas for the brainstorm'],
      ['convert', 'brainstorm → structured map'],
      ['improve', 'sharper titles, groups, notes'],
    ]
    parts.push(
      m.ag({ o: show(T0 + 1.6, T0 + 3.0, 0.2) }, [
        rect(60, 150, 300, 238, {
          rx: 12,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        text(80, 178, 'Export for AI', { size: 15, weight: 700 }),
        text(80, 204, 'INTENT', { size: 11, weight: 700, fill: C.mute }),
        ...intents.flatMap(([a, b], i) => [
          circle(88, 226 + i * 32, 6.5, { fill: C.white, stroke: C.faint, sw: 1.4 }),
          text(102, 230.5 + i * 32, a, { size: 13, weight: 700 }),
          text(102 + textWidth(a, 13, 700) + 8, 230.5 + i * 32, b, { size: 12.5, fill: C.mute }),
        ]),
        m.ag({ o: on(T0 + 2.0, 0.15) }, circle(88, 258, 3.5, { fill: C.blue })),
        m.ag({ o: on(T0 + 2.0, 0.15) }, circle(88, 258, 6.5, { stroke: C.blue, sw: 1.6 })),
        rect(80, 334, 140, 32, { rx: 8, fill: C.blue }),
        text(150, 355, 'Download packet', {
          size: 13,
          weight: 600,
          fill: C.white,
          anchor: 'middle',
        }),
      ]),
    )
    parts.push(
      pointer(
        m,
        [
          [T0 + 0.1, 250, 300],
          [T0 + 0.35, 330, 140],
          [T0 + 0.75, 330, 140],
          [T0 + 0.95, 240, 252],
          [T0 + 1.75, 240, 252],
          [T0 + 1.95, 92, 260],
          [T0 + 2.3, 92, 260],
          [T0 + 2.55, 150, 352],
        ],
        T0 + 2.9,
      ),
    )
    parts.push(
      ripple(m, T0 + 0.4, 330, 140),
      ripple(m, T0 + 1.0, 240, 252),
      ripple(m, T0 + 2.0, 92, 260),
      ripple(m, T0 + 2.6, 150, 352),
    )
    // The assistant.
    parts.push(rect(600, 110, 320, 310, { rx: 12, fill: C.paper, stroke: C.line }))
    parts.push(
      text(620, 140, 'Your AI assistant', { size: 15, weight: 700 }),
      text(620, 160, 'Any assistant that reads and writes files', { size: 12, fill: C.mute }),
    )
    parts.push(
      rect(620, 180, 130, 54, { rx: 9, fill: C.white, stroke: C.line }),
      folderIcon(632, 190),
      text(656, 204, 'skill/', { size: 13, weight: 700, mono: true }),
      text(632, 224, 'how to answer', { size: 11.5, fill: C.mute }),
    )
    parts.push(
      rect(770, 180, 130, 54, { rx: 9, fill: C.white, stroke: C.line }),
      folderIcon(782, 190),
      text(806, 204, 'schemas/', { size: 13, weight: 700, mono: true }),
      text(782, 224, 'JSON Schemas', { size: 11.5, fill: C.mute }),
    )
    ;[0, 1, 2].forEach((i) =>
      parts.push(
        m.ag(
          {
            o: [
              [T0 + 3.9 + i * 0.15, 0.2],
              [T0 + 4.1 + i * 0.15, 1],
              [T0 + 4.5 + i * 0.15, 0.2],
              [T0 + 4.7 + i * 0.15, 1],
              [T0 + 5.1, 0],
            ],
          },
          circle(740 + i * 20, 276, 5, { fill: C.blue }),
        ),
      ),
    )
    parts.push(
      m.ag({ o: on(T0 + 5.0, 0.3) }, [
        circle(668, 276, 11, { fill: C.teal }),
        path('M662.5 276.5L666.5 280.5L673.5 272.5', { stroke: C.white, sw: 2.2 }),
        text(688, 281, 'Reply checked against schemas/', { size: 12.5, weight: 600, fill: C.teal }),
      ]),
    )
    parts.push(
      text(620, 330, 'No API key: the app never', { size: 12.5, fill: C.mute }),
      text(620, 348, 'calls an AI itself.', { size: 12.5, fill: C.mute }),
    )
    // Files moving between them.
    const doc = (label, color) =>
      [
        rect(-34, -16, 68, 32, { rx: 7, fill: C.white, stroke: color, sw: 1.5 }),
        fileIcon(-26, -8, color),
        text(-8, 4.5, label, { size: 11, weight: 700, fill: color, mono: true }),
      ].join('')
    parts.push(
      path('M380 196H600', { stroke: C.line, sw: 2, dash: '4 4' }),
      path('M600 360H380', { stroke: C.line, sw: 2, dash: '4 4' }),
    )
    parts.push(
      m.ag(
        { o: show(T0 + 2.9, T0 + 4.0, 0.2), t: move(T0 + 3.0, T0 + 3.8, [416, 196], [566, 196]) },
        doc('.json', C.blue),
      ),
    )
    parts.push(
      m.ag(
        { o: show(T0 + 5.3, T0 + 6.4, 0.2), t: move(T0 + 5.4, T0 + 6.2, [566, 360], [416, 360]) },
        doc('.json', C.teal),
      ),
    )
    parts.push(
      text(490, 172, 'packet', { size: 12, fill: C.mute, anchor: 'middle' }),
      text(490, 394, 'reply', { size: 12, fill: C.mute, anchor: 'middle' }),
    )
    // The apply dialog (src/i18n: apply.convertTitle / convertApply / convertApplyDetail).
    parts.push(
      m.ag({ o: show(T0 + 6.3, T0 + 7.6, 0.2) }, [
        rect(56, 196, 308, 128, {
          rx: 12,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        text(74, 222, 'Import an AI mind map', { size: 14, weight: 700 }),
        rect(74, 234, 272, 44, { rx: 8, fill: C.blue }),
        text(88, 252, 'Put the map into “Launch plan”', { size: 12.5, weight: 700, fill: C.white }),
        text(88, 269, 'One Undo reverts it.', { size: 11.5, fill: C.blueSoft }),
        text(88, 304, 'Import as a new project', { size: 12.5, fill: C.mute }),
      ]),
    )
    parts.push(ripple(m, T0 + 6.9, 210, 256, C.white))
    parts.push(
      status(T0 + 0.3, T0 + 3.0, 'Export ▾ → For AI… makes a packet: expand, convert or improve.'),
    )
    parts.push(
      status(
        T0 + 3.0,
        T0 + 6.2,
        'Your assistant follows skill/ and checks its reply against schemas/.',
      ),
    )
    parts.push(
      status(
        T0 + 6.2,
        S[2],
        'Import the reply: it goes back into the project, and one Undo reverts it.',
      ),
    )
    out.push(m.ag({ o: show(S[1], S[2]) }, parts))
    out.push(
      caption(
        m,
        S[1],
        S[2],
        'An AI round trip, no API key',
        'The app hands your AI assistant a file and takes the answer back.',
      ),
    )
  }
  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
