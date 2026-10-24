/** docs/data-safety.svg: autosave and undo, snapshots, the Trash, backup, storage and two tabs. */
import {
  C,
  Movie,
  N,
  about,
  caption,
  drawNode,
  drawnEdge,
  edge,
  keys,
  move,
  on,
  pill,
  pointer,
  progressBar,
  rect,
  ring,
  ripple,
  show,
  text,
  typed,
  windowBack,
} from '../svg-movie.mjs'
import { button, card, checkbox, fileIcon, folderIcon, toast } from './ui.mjs'

/** The app's top bar inside the window: project name, Project ▾ and the save badge. */
function appBar(m, title, savedFrom = null) {
  const parts = [
    rect(24, 104, 912, 40, { rx: 10, fill: C.paper, stroke: C.rule }),
    text(42, 129, title, { size: 15, weight: 700 }),
    button(150, 110, 'Project ▾', { size: 12.5 }).svg,
  ]
  if (savedFrom) parts.push(savedFrom)
  return parts.join('')
}

/** "Saving…" until `a`, then "Saved", at the right of the app bar. */
function saveBadge(m, saving, saved) {
  return [
    m.ag(
      { o: show(saving, saved + 0.1, 0.12) },
      text(916, 129, 'Saving…', { size: 12.5, fill: C.mute, anchor: 'end' }),
    ),
    m.ag(
      {
        o: [
          [saving, 1],
          [saving + 0.1, 0],
          [saved, 0],
          [saved + 0.15, 1],
        ],
      },
      text(916, 129, 'Saved', { size: 12.5, fill: C.teal, anchor: 'end', weight: 700 }),
    ),
  ].join('')
}

export function dataSafety() {
  const S = [0, 5.8, 11.8, 17.6, 23.8]
  const m = new Movie({
    id: 'ds',
    width: 960,
    height: 500,
    duration: S[4],
    poster: 15.0,
    title: 'Mind Map Studio: safe with your data',
    desc:
      'A looping animation in four scenes. 1: a new node is typed and the badge goes from Saving… to Saved, because every change is saved in the browser (IndexedDB); after a reload the map is unchanged and Ctrl+Z still undoes the new node. ' +
      '2: Project, Save snapshot… saves a snapshot named Before pricing change; the Snapshots list shows it with an earlier one, and restoring is one step you can undo. ' +
      '3: on the start screen a project is moved to the Trash, where it shows deleted forever in 30 days, and Restore brings it back. ' +
      '4: Back up all projects downloads one ZIP with the projects, their snapshots, custom presets and pictures, but not the Trash; the storage meter offers Keep my data; and when another tab changed the same project, this tab’s edits are saved as a copy.',
  })
  const out = [windowBack(m)]

  /* --- scene 1: autosave, reload, undo --- */
  {
    const r = N('Launch plan', 'root', { center: 400, cy: 300 })
    const a = N('Audience', 'branch', { x: 540, cy: 230 })
    const b = N('Channels', 'branch', { x: 540, cy: 300 })
    const c = N('Pricing', 'branch', { x: 540, cy: 370 })
    const map = [
      edge(r, a),
      edge(r, b),
      drawNode(r),
      drawNode(a),
      drawNode(b),
      m.ag(
        {
          o: [
            [4.0, 1],
            [4.3, 0],
          ],
        },
        drawnEdge(m, r, c, 0.55, 0.85),
      ),
      m.ag(
        {
          o: [
            [0.6, 0],
            [0.8, 1],
            [4.0, 1],
            [4.3, 0],
          ],
        },
        [
          rect(c.x, c.y, c.w, c.h, { rx: 9, fill: C.white, stroke: C.blue, sw: 1.5 }),
          typed(m, c.x + 14, c.cy + 5, 'Pricing', 0.8, 1.25, { size: 14, weight: 600 }),
        ],
      ),
      m.ag(
        {
          o: [
            [0.6, 0],
            [0.8, 1],
            [1.4, 1],
            [1.6, 0],
          ],
        },
        ring(c),
      ),
    ]
    const parts = [
      appBar(m, 'Launch plan'),
      saveBadge(m, 0.8, 1.9),
      // Reload: the page goes blank for a moment and comes back as it was.
      m.ag(
        {
          o: [
            [2.45, 1],
            [2.6, 0],
            [3.0, 0],
            [3.25, 1],
          ],
        },
        map,
      ),
      m.ag(
        { o: show(2.55, 3.15, 0.1) },
        text(480, 300, 'Reloading…', { size: 14, fill: C.mute, anchor: 'middle' }),
      ),
      m.ag(
        { o: show(4.2, S[1], 0.25) },
        pill(540, 362, 'Undo still works after the reload', {
          fill: C.tealSoft,
          color: C.teal,
          size: 12,
          h: 22,
        }).svg,
      ),
      text(
        42,
        430,
        'Saved in this browser (IndexedDB), at least every 5 seconds even while you keep typing.',
        { size: 12.5, fill: C.mute },
      ),
    ]
    out.push(m.ag({ o: show(S[0], S[1]) }, parts))
    out.push(
      keys(m, 0.35, ['Tab'], { dur: 0.7 }),
      keys(m, 2.3, ['Ctrl', 'R'], { dur: 0.9 }),
      keys(m, 3.85, ['Ctrl', 'Z'], { dur: 1.0 }),
    )
    out.push(
      caption(
        m,
        S[0],
        S[1],
        'Autosave and undo',
        'Every change is saved in your browser, and undo survives a reload.',
      ),
    )
  }

  /* --- scene 2: snapshots --- */
  {
    const T0 = S[1]
    const menu = ['Save', 'Save As…', 'Save snapshot…', 'Snapshots (1)…', 'Duplicate']
    const parts = [
      appBar(m, 'Launch plan'),
      text(916, 129, 'Saved', { size: 12.5, fill: C.teal, anchor: 'end', weight: 700 }),
      m.ag({ o: show(T0 + 0.6, T0 + 1.6, 0.15) }, [
        rect(150, 146, 170, 8 + menu.length * 28, {
          rx: 9,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        m.ag(
          { o: on(T0 + 1.15, 0.1) },
          rect(154, 150 + 2 * 28, 162, 26, { rx: 6, fill: C.blueSoft }),
        ),
        ...menu.map((t, i) => text(166, 168 + i * 28, t, { size: 13 })),
      ]),
      m.ag({ o: show(T0 + 1.6, T0 + 3.1, 0.2) }, [
        rect(300, 170, 360, 150, {
          rx: 12,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        text(322, 200, 'Save snapshot', { size: 15, weight: 700 }),
        rect(322, 216, 316, 32, { rx: 7, fill: C.white, stroke: C.blue, sw: 1.5 }),
        typed(m, 334, 237, 'Before pricing change', T0 + 1.9, T0 + 2.5, { size: 13.5 }),
        button(566, 270, 'Save', { primary: true, w: 72 }).svg,
      ]),
      m.ag(
        { o: show(T0 + 3.0, T0 + 4.3, 0.2) },
        toast(480, 400, 'Saved snapshot “Before pricing change”'),
      ),
    ]
    const rows = [
      ['Before pricing change', 'Today 14:05 · 12 nodes'],
      ['First draft', 'Yesterday 09:30 · 7 nodes'],
    ]
    parts.push(
      m.ag({ o: show(T0 + 3.4, S[2], 0.25), t: move(T0 + 3.4, T0 + 3.7, [0, 8], [0, 0]) }, [
        rect(220, 160, 520, 236, {
          rx: 12,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        text(242, 190, 'Snapshots', { size: 15, weight: 700 }),
        text(
          242,
          212,
          'Named copies of this project you can go back to. Restoring is one step you can undo.',
          { size: 11.5, fill: C.mute },
        ),
        ...rows.flatMap(([name, meta], i) => {
          const y = 232 + i * 62
          return [
            rect(242, y, 476, 52, { rx: 8, fill: C.paper, stroke: C.rule }),
            text(258, y + 22, name, { size: 13.5, weight: 600 }),
            text(258, y + 40, meta, { size: 11.5, fill: C.mute }),
            button(476, y + 12, 'Restore', { size: 12, h: 26 }).svg,
            button(552, y + 12, 'Rename', { size: 12, h: 26 }).svg,
            button(632, y + 12, 'Delete', { size: 12, h: 26 }).svg,
          ]
        }),
        m.ag(
          { o: show(T0 + 4.6, T0 + 5.1, 0.1) },
          button(476, 306, 'Restore', { size: 12, h: 26, primary: true }).svg,
        ),
        m.ag(
          { o: on(T0 + 5.0, 0.2) },
          pill(258, 362, 'Restored “First draft” · Ctrl+Z undoes it', {
            fill: C.tealSoft,
            color: C.teal,
            size: 12,
            h: 22,
          }).svg,
        ),
      ]),
    )
    parts.push(
      pointer(
        m,
        [
          [T0 + 0.2, 400, 300],
          [T0 + 0.5, 190, 124],
          [T0 + 0.9, 190, 124],
          [T0 + 1.1, 220, 210],
          [T0 + 2.6, 220, 210],
          [T0 + 2.85, 600, 284],
          [T0 + 4.1, 600, 284],
          [T0 + 4.5, 510, 320],
        ],
        T0 + 5.4,
      ),
      ripple(m, T0 + 0.55, 190, 124),
      ripple(m, T0 + 1.15, 220, 210),
      ripple(m, T0 + 2.9, 600, 284),
      ripple(m, T0 + 4.6, 510, 320),
    )
    out.push(m.ag({ o: show(S[1], S[2]) }, parts))
    out.push(
      caption(
        m,
        S[1],
        S[2],
        'Named snapshots',
        'Save a snapshot before a big change; restore it in one undoable step.',
      ),
    )
  }

  /* --- scene 3: the Trash --- */
  {
    const T0 = S[2]
    const projects = ['Launch plan', 'Q3 plan', 'Reading list']
    const cardAt = (i) => ({ x: 60 + i * 222, y: 168 })
    const parts = [
      text(42, 136, 'Projects', { size: 17, weight: 700 }),
      button(816, 116, 'Trash', { size: 12.5, w: 104 }).svg,
      m.ag(
        { o: show(T0 + 1.6, T0 + 4.7, 0.2) },
        pill(882, 109, '1', { fill: C.amber, color: C.white, size: 10.5, h: 17, w: 20 }).svg,
      ),
    ]
    projects.forEach((name, i) => {
      const { x, y } = cardAt(i)
      const body = [
        rect(x, y, 200, 120, { rx: 12, fill: C.white, stroke: C.line }),
        rect(x + 14, y + 14, 172, 52, { rx: 8, fill: C.soft }),
        text(x + 16, y + 90, name, { size: 14, weight: 700 }),
        text(x + 16, y + 108, 'Edited today', { size: 11.5, fill: C.mute }),
        text(x + 182, y + 92, '⋯', { size: 16, fill: C.mute, anchor: 'middle' }),
      ]
      if (i < 2) parts.push(body.join(''))
      else
        parts.push(
          m.ag(
            {
              o: [
                [T0 + 1.25, 1],
                [T0 + 1.6, 0],
                [T0 + 4.4, 0],
                [T0 + 4.75, 1],
              ],
              t: [
                [T0 + 1.25, [0, 0, 1]],
                [T0 + 1.6, about(860, 130, 0.2)],
                [T0 + 4.4, about(860, 130, 0.2)],
                [T0 + 4.75, [0, 0, 1]],
              ],
            },
            body,
          ),
        )
    })
    const { x: cx, y: cy } = cardAt(2)
    parts.push(
      m.ag({ o: show(T0 + 0.6, T0 + 1.3, 0.12) }, [
        rect(cx + 120, cy + 100, 150, 64, {
          rx: 9,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        text(cx + 134, cy + 122, 'Duplicate', { size: 13 }),
        rect(cx + 124, cy + 132, 142, 26, { rx: 6, fill: C.amberSoft }),
        text(cx + 134, cy + 150, 'Move to trash…', { size: 13, fill: C.amber, weight: 600 }),
      ]),
    )
    parts.push(
      m.ag({ o: show(T0 + 2.2, T0 + 5.5, 0.25), t: move(T0 + 2.2, T0 + 2.5, [0, 8], [0, 0]) }, [
        rect(250, 186, 460, 200, {
          rx: 12,
          fill: C.white,
          stroke: C.line,
          filter: `url(#${m.id}-shadow)`,
        }),
        text(272, 216, 'Trash', { size: 15, weight: 700 }),
        rect(272, 232, 416, 58, { rx: 8, fill: C.paper, stroke: C.rule }),
        text(288, 256, 'Reading list', { size: 13.5, weight: 600 }),
        text(288, 276, 'deleted forever in 30 days', { size: 12, fill: C.amber }),
        button(510, 246, 'Restore', { size: 12, h: 28 }).svg,
        m.ag(
          { o: show(T0 + 3.9, T0 + 4.4, 0.1) },
          button(510, 246, 'Restore', { size: 12, h: 28, primary: true }).svg,
        ),
        button(588, 246, 'Delete forever', { size: 12, h: 28, color: C.amber }).svg,
        checkbox(272, 314, true),
        text(294, 326, 'Delete projects forever after 30 days in the trash', { size: 12.5 }),
        text(272, 360, 'The Trash is not part of a backup.', { size: 11.5, fill: C.mute }),
      ]),
    )
    parts.push(
      pointer(
        m,
        [
          [T0 + 0.1, 500, 420],
          [T0 + 0.45, cx + 182, cy + 88],
          [T0 + 0.75, cx + 182, cy + 88],
          [T0 + 1.0, cx + 190, cy + 146],
          [T0 + 1.6, cx + 190, cy + 146],
          [T0 + 1.95, 868, 130],
          [T0 + 3.4, 868, 130],
          [T0 + 3.8, 545, 262],
        ],
        T0 + 4.6,
      ),
      ripple(m, T0 + 0.5, cx + 182, cy + 88),
      ripple(m, T0 + 1.1, cx + 190, cy + 146),
      ripple(m, T0 + 2.0, 868, 130),
      ripple(m, T0 + 3.9, 545, 262),
    )
    out.push(m.ag({ o: show(S[2], S[3]) }, parts))
    out.push(
      caption(
        m,
        S[2],
        S[3],
        'A Trash with 30 days to change your mind',
        'A removed project waits in the Trash; Restore brings it back.',
      ),
    )
  }

  /* --- scene 4: backup, storage, two tabs --- */
  {
    const T0 = S[3]
    const parts = [
      card(40, 108, 430, 270, 'Back up all projects'),
      text(58, 174, 'One ZIP of the whole library, with pictures.', { size: 12.5, fill: C.mute }),
      button(58, 188, 'Back up all projects', { primary: true, size: 12.5 }).svg,
      m.ag({ o: on(T0 + 0.8, 0.3), t: move(T0 + 0.8, T0 + 1.1, [0, 6], [0, 0]) }, [
        rect(58, 230, 394, 132, { rx: 9, fill: C.paper, stroke: C.rule }),
        fileIcon(72, 242, C.blue),
        text(92, 255, 'mindmap-backup-2026-10-24.zip', {
          size: 12.5,
          weight: 700,
          mono: true,
          fill: C.blue,
        }),
        ...[
          ['manifest.json', 'what is inside'],
          ['Projects', 'every project in the library'],
          ['Snapshots', 'their named snapshots'],
          ['Custom presets', 'your own styles'],
          ['Pictures', 'each stored once'],
        ].map(([a, b], i) =>
          [
            folderIcon(76, 266 + i * 18, C.mute).replace(/stroke-width="1.3"/, 'stroke-width="1"'),
            text(100, 279 + i * 18, a, { size: 11.5, weight: 600 }),
            text(206, 279 + i * 18, b, { size: 11.5, fill: C.mute }),
          ].join(''),
        ),
      ]),
      card(490, 108, 430, 160, 'Storage'),
      text(508, 176, 'Using 3.1 MB', { size: 12.5 }),
      rect(508, 186, 394, 8, { rx: 4, fill: C.rule }),
      rect(508, 186, 30, 8, { rx: 4, fill: C.blue }),
      m.ag(
        {
          o: [
            [T0 + 2.6, 1],
            [T0 + 2.8, 0],
          ],
        },
        text(508, 216, 'The browser may clear this data if the device runs low on space.', {
          size: 11.5,
          fill: C.mute,
        }),
      ),
      m.ag(
        {
          o: [
            [T0 + 2.6, 1],
            [T0 + 2.8, 0],
          ],
        },
        button(508, 228, 'Keep my data', { size: 12, h: 26 }).svg,
      ),
      m.ag({ o: on(T0 + 2.75, 0.25) }, [
        text(508, 216, 'Protected: the browser will not clear this data to free space.', {
          size: 11.5,
          fill: C.teal,
          weight: 600,
        }),
      ]),
      card(490, 282, 430, 96, 'Two tabs, one project'),
      text(508, 348, 'Both tabs keep their edits; nothing is overwritten.', {
        size: 12.5,
        fill: C.mute,
      }),
      m.ag(
        { o: show(T0 + 1.1, T0 + 2.9, 0.25) },
        toast(480, 412, 'Backed up 3 projects. Keep the ZIP somewhere safe; Import restores it.'),
      ),
      m.ag(
        { o: show(T0 + 3.6, S[4], 0.3) },
        toast(
          480,
          412,
          [
            '“Launch plan” was changed in another tab.',
            'Your edits from this tab were saved as “Launch plan (conflict copy)”.',
          ],
          { size: 12 },
        ),
      ),
      pointer(
        m,
        [
          [T0 + 0.2, 300, 420],
          [T0 + 0.55, 120, 202],
          [T0 + 2.0, 120, 202],
          [T0 + 2.4, 560, 241],
        ],
        T0 + 3.2,
      ),
      ripple(m, T0 + 0.6, 120, 202),
      ripple(m, T0 + 2.5, 560, 241),
    ]
    out.push(m.ag({ o: show(S[3], S[4]) }, parts))
    out.push(
      caption(
        m,
        S[3],
        S[4],
        'Backup, storage and two tabs',
        'One ZIP backs up everything; Keep my data asks the browser not to clear it.',
      ),
    )
  }

  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
