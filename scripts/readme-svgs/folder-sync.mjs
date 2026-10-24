/** docs/folder-sync.svg: syncing between computers through a synced folder. */
import {
  C,
  Movie,
  caption,
  circle,
  edge,
  move,
  on,
  pill,
  progressBar,
  rect,
  show,
  text,
  windowBack,
} from '../svg-movie.mjs'
import { card, fileIcon, folderIcon, miniApp } from './ui.mjs'

/** A miniature map: a root and two children, plus a third child that appears at `t`. */
export function mini(m, x, y, extra) {
  const rr = { x, y: y - 9, w: 56, h: 18, cx: x + 28, cy: y, r: x + 56, b: y + 9 }
  const kids = [-22, 0, 22].map((d) => ({
    x: x + 86,
    y: y + d - 7,
    w: 58,
    h: 14,
    cx: x + 115,
    cy: y + d,
    r: x + 144,
    b: y + d + 7,
  }))
  const parts = [
    edge(rr, kids[0], { sw: 1.2 }),
    edge(rr, kids[1], { sw: 1.2 }),
    rect(rr.x, rr.y, rr.w, rr.h, { rx: 5, fill: C.blue }),
  ]
  for (const k of kids.slice(0, 2))
    parts.push(rect(k.x, k.y, k.w, k.h, { rx: 4, fill: C.white, stroke: C.line }))
  for (const [t, col, i = 2] of extra) {
    const k = kids[i]
    const soft = col === C.amber ? C.amberSoft : C.tealSoft
    if (i === 2)
      parts.push(
        m.ag({ o: on(t, 0.3) }, [
          edge(rr, k, { sw: 1.2, stroke: col }),
          rect(k.x, k.y, k.w, k.h, { rx: 4, fill: soft, stroke: col }),
        ]),
      )
    else
      parts.push(
        m.ag(
          { o: on(t, 0.3) },
          rect(k.x, k.y, k.w, k.h, { rx: 4, fill: soft, stroke: col, sw: 2 }),
        ),
      )
  }
  return parts.join('')
}

export function folderSync() {
  const S = [0, 6.4, 12.4, 18.8]
  const m = new Movie({
    id: 'fs',
    width: 960,
    height: 460,
    duration: S[3],
    poster: 17.6,
    title: 'Mind Map Studio: syncing between computers through a synced folder',
    desc:
      'A looping animation in three scenes. 1: an edit on this computer is written to the synced folder about 10 seconds after you stop editing, as name (id).mindmap.json with pictures in _assets; ' +
      'the other computer reads it when you come back to its window. 2: a project removed on one computer goes to the folder’s _trash subfolder instead of being deleted; if many files vanish at once, sync pauses and asks first. ' +
      '3: when both computers changed the same project, the newer one stays and the other is kept as a conflict copy tagged conflict.',
  })
  const out = [windowBack(m)]
  const status = (a, b, value) =>
    m.ag(
      { o: show(a, b, 0.3) },
      text(480, 428, value, { size: 14, fill: C.ink, anchor: 'middle', weight: 600 }),
    )
  const dot = (a, b, p, q, color = C.blue) =>
    m.ag(
      { o: show(a - 0.05, b + 0.15, 0.1), t: move(a, b, p, q) },
      circle(0, 0, 6, { fill: color }),
    )
  const row = (y, name, o = {}) =>
    [
      fileIcon(378, y - 12, o.color),
      text(398, y, name, { size: 12, fill: o.color ?? C.ink, weight: o.weight }),
    ].join('')

  // Static frame: this computer, the folder, the other computer.
  out.push(
    card(40, 110, 250, 286, 'This computer'),
    miniApp(m, 56, 164, 218, 104, 'Launch plan'),
    card(360, 110, 240, 286, ''),
    folderIcon(376, 124),
    text(402, 138, 'OneDrive › MindMaps', { size: 13, weight: 700 }),
    '<path d="M361 152.5H599" fill="none" stroke="#e2e8f0" stroke-linecap="round"/>',
    card(670, 110, 250, 286, 'Other computer'),
    miniApp(m, 686, 164, 218, 104, 'Launch plan'),
    '<path d="M290 216H360" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 4"/>',
    '<path d="M600 216H670" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 4"/>',
    text(56, 300, 'Chrome or Edge on a computer,', { size: 12, fill: C.mute }),
    text(56, 318, 'with Sync folder… pointing at', { size: 12, fill: C.mute }),
    text(56, 336, 'a folder OneDrive keeps synced.', { size: 12, fill: C.mute }),
    text(686, 300, 'Same folder, same app.', { size: 12, fill: C.mute }),
    text(686, 318, 'Reads changes when you come', { size: 12, fill: C.mute }),
    text(686, 336, 'back to the window.', { size: 12, fill: C.mute }),
  )

  /* --- scene 1: write, then read on the other computer --- */
  {
    const parts = [
      mini(m, 76, 226, [[0.5, C.teal]]),
      mini(m, 706, 226, [[3.9, C.teal]]),
      m.ag(
        { o: show(0.5, 1.3, 0.15) },
        text(266, 182, 'Saving…', { size: 11.5, fill: C.mute, anchor: 'end' }),
      ),
      m.ag(
        { o: on(1.3, 0.15) },
        text(266, 182, 'Saved', { size: 11.5, fill: C.teal, anchor: 'end', weight: 700 }),
      ),
      text(896, 182, 'Saved', { size: 11.5, fill: C.teal, anchor: 'end', weight: 700 }),
      dot(2.0, 2.6, [290, 216], [360, 216]),
      m.ag({ o: show(2.6, 3.4, 0.2) }, rect(368, 162, 224, 26, { rx: 6, fill: C.blueSoft })),
      row(180, 'Launch plan (a1b2).mindmap.json'),
      folderIcon(378, 194, C.mute),
      text(402, 208, '_assets/', { size: 12 }),
      m.ag(
        { o: on(2.7, 0.3) },
        text(462, 208, 'hero.webp', { size: 11, fill: C.teal, weight: 600 }),
      ),
      dot(3.2, 3.8, [600, 216], [670, 216]),
      status(0.3, 2.0, 'Edit as usual: the project is saved in this browser.'),
      status(
        2.0,
        S[1],
        'About 10 s after you stop, it is written to the folder; pictures go to _assets/.',
      ),
    ]
    out.push(m.ag({ o: show(S[0], S[1]) }, parts))
    out.push(
      caption(
        m,
        S[0],
        S[1],
        'Sync through a folder',
        'Each project is a normal file in a folder OneDrive (or any sync app) keeps.',
      ),
    )
  }

  /* --- scene 2: deletions go to _trash --- */
  {
    const T0 = S[1]
    const parts = [
      mini(m, 76, 226, []),
      mini(m, 706, 226, []),
      m.ag(
        {
          o: [
            [T0 + 0.8, 1],
            [T0 + 1.1, 0],
          ],
        },
        row(180, 'Old ideas (c9e0).mindmap.json'),
      ),
      row(206, 'Launch plan (a1b2).mindmap.json'),
      folderIcon(378, 220, C.mute),
      text(402, 234, '_assets/', { size: 12 }),
      folderIcon(378, 246, C.mute),
      text(402, 260, '_trash/', { size: 12, weight: 700 }),
      m.ag(
        { o: on(T0 + 1.5, 0.3), t: move(T0 + 1.5, T0 + 1.8, [0, -60], [0, 0]) },
        row(282, 'Old ideas (c9e0).mindmap.json', { color: C.mute }),
      ),
      m.ag({ o: on(T0 + 2.6, 0.3) }, [
        rect(368, 300, 224, 84, { rx: 8, fill: C.amberSoft }),
        text(380, 322, 'Many files gone at once?', { size: 12, weight: 700, fill: C.amber }),
        text(380, 342, 'Sync pauses and asks first,', { size: 12, fill: C.ink }),
        text(380, 360, 'so a paused OneDrive or the', { size: 12, fill: C.ink }),
        text(380, 376, 'wrong folder deletes nothing.', { size: 12, fill: C.ink }),
      ]),
      dot(T0 + 0.3, T0 + 0.9, [290, 216], [360, 216], C.amber),
      status(
        T0 + 0.3,
        S[2],
        'A removed project goes to _trash/ in the folder; nothing is deleted outright.',
      ),
    ]
    out.push(m.ag({ o: show(S[1], S[2]) }, parts))
    out.push(
      caption(
        m,
        S[1],
        S[2],
        'Safe deletions',
        'Projects removed on one computer wait in the folder’s _trash subfolder.',
      ),
    )
  }

  /* --- scene 3: conflicts keep both --- */
  {
    const T0 = S[2]
    const parts = [
      mini(m, 76, 226, [[T0 + 0.6, C.teal, 0]]),
      mini(m, 706, 226, [[T0 + 0.6, C.amber, 0]]),
      row(180, 'Launch plan (a1b2).mindmap.json'),
      folderIcon(378, 194, C.mute),
      text(402, 208, '_assets/', { size: 12 }),
      folderIcon(378, 222, C.mute),
      text(402, 236, '_trash/', { size: 12 }),
      dot(T0 + 1.3, T0 + 1.9, [290, 216], [360, 216], C.teal),
      dot(T0 + 1.3, T0 + 1.9, [670, 216], [600, 216], C.amber),
      m.ag({ o: on(T0 + 2.2, 0.35), t: move(T0 + 2.2, T0 + 2.5, [0, 6], [0, 0]) }, [
        rect(368, 252, 224, 52, { rx: 6, fill: C.amberSoft }),
        row(270, 'Launch plan (c3d4).mindmap.json'),
        pill(398, 280, 'conflict', {
          fill: C.white,
          stroke: C.amber,
          sw: 1,
          color: C.amber,
          size: 10.5,
          h: 16,
        }).svg,
        text(458, 292, 'kept, not lost', { size: 11, fill: C.amber, weight: 600 }),
      ]),
      status(T0 + 0.3, T0 + 2.2, 'Both computers changed the same project while apart…'),
      status(
        T0 + 2.2,
        S[3],
        'The newer version stays; the other is kept as a copy tagged conflict.',
      ),
    ]
    out.push(m.ag({ o: show(S[2], S[3]) }, parts))
    out.push(
      caption(
        m,
        S[2],
        S[3],
        'Conflicts keep both',
        'If both computers changed a project, neither version is lost.',
      ),
    )
  }

  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
