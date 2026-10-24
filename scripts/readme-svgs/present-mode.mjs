/** docs/present-mode.svg: present mode, its controls, and presenting from an exported page. */
import {
  C,
  Movie,
  N,
  caption,
  drawNode,
  edge,
  g,
  keys,
  on,
  progressBar,
  rect,
  ring,
  show,
  text,
  windowBack,
} from '../svg-movie.mjs'
import { browser, button, notesCard, presentStage } from './ui.mjs'

/** The sample map, centred on `cy`, in presentation order. */
export function sampleMap(cy) {
  const root = N('Launch plan', 'root', { center: 480, cy })
  const pricing = N('Pricing', 'branch', { x: 610, cy })
  const hiring = N('Hiring', 'branch', { right: 350, cy })
  const tiers = N('Tiers', 'leaf', { x: 760, cy: cy - 60 })
  const discounts = N('Discounts', 'leaf', { x: 760, cy })
  const trials = N('Trials', 'leaf', { x: 760, cy: cy + 60 })
  const designer = N('Designer', 'leaf', { right: 210, cy: cy - 35 })
  const engineer = N('Engineer', 'leaf', { right: 210, cy: cy + 35 })
  const tree = [
    [root, pricing],
    [root, hiring],
    [pricing, tiers],
    [pricing, discounts],
    [pricing, trials],
    [hiring, designer],
    [hiring, engineer],
  ]
  // src/present/steps.ts: the root, its children clockwise (right side, then left), then depth first.
  const order = [root, pricing, hiring, tiers, discounts, trials, designer, engineer]
  return { root, pricing, hiring, tiers, discounts, trials, tree, order }
}

export const lightMap = (map) =>
  [...map.tree.map(([a, b]) => edge(a, b)), ...map.order.map((n) => drawNode(n))].join('')

export function presentMode() {
  const S = [0, 8.6, 15.4, 21.6]
  const m = new Movie({
    id: 'pm',
    width: 960,
    height: 500,
    duration: S[3],
    poster: 10.6,
    title: 'Mind Map Studio: present mode',
    desc:
      'A looping animation in three scenes. 1: F5 turns the map into a dark full-screen presentation. Step 1 of 8 shows the central topic Launch plan, ' +
      'step 2 the branch Pricing, step 3 the branch Hiring (main branches go clockwise), and step 4 Pricing’s first child Tiers, with earlier steps dimmed. ' +
      '2: N shows the notes of Tiers as a card, B blanks the screen and B brings it back; after Esc, Shift+F5 starts presenting at the selected node Trials, step 6 of 8. ' +
      '3: an exported HTML page opened from a file in a browser presents the same way when F5 is pressed.',
  })
  const out = [windowBack(m)]
  const map = sampleMap(285)
  const stage = { x: 40, y: 112, w: 880, h: 296, clip: { x: 1, y: 35, w: 958, h: 432 } }

  /* --- scenes 1 and 2: the studio, then the dark stage --- */
  out.push(
    m.ag({ o: show(S[0], 1.4, 0.3) }, [lightMap(map), ring(map.root)]),
    m.ag({ o: show(13.35, 14.45, 0.25) }, [lightMap(map), ring(map.trials)]),
  )
  const steps = [
    { n: map.root, t: 1.6 },
    { n: map.pricing, t: 3.0 },
    { n: map.hiring, t: 4.4 },
    { n: map.tiers, t: 5.8 },
    { n: map.trials, t: 14.3 },
  ]
  const night = [
    rect(0.5, 0.5, 959, 499, { rx: 14, fill: C.night }),
    presentStage(m, { tree: map.tree, order: map.order, steps, end: S[2], stage, hudY: 420 }),
    // N: the notes card for Tiers (plain text, as the stage shows notes).
    m.ag(
      { o: show(9.3, 11.4, 0.3) },
      notesCard(620, 296, 300, 'Notes · Tiers', [
        'Free, Team and Business.',
        'Show the comparison table.',
      ]),
    ),
    // B: the screen goes black, and B brings it back.
    m.ag({ o: show(11.75, 13.0, 0.25) }, rect(1, 35, 958, 432, { fill: '#000000' })),
  ]
  out.push(
    m.ag(
      {
        o: [
          [0.95, 0],
          [1.4, 1],
          [13.3, 1],
          [13.5, 0],
          [14.3, 0],
          [14.5, 1],
          [S[2] - 0.35, 1],
          [S[2], 0],
        ],
      },
      night,
    ),
  )
  out.push(
    keys(m, 0.7, ['F5'], { dur: 1.1 }),
    keys(m, 2.85, ['→'], { dur: 0.9 }),
    keys(m, 4.25, ['Space'], { dur: 0.9 }),
    keys(m, 5.65, ['→'], { dur: 0.9 }),
    keys(m, 9.1, ['N'], { dur: 0.9 }),
    keys(m, 11.55, ['B'], { dur: 0.9 }),
    keys(m, 12.8, ['B'], { dur: 0.6 }),
    keys(m, 13.15, ['Esc'], { dur: 0.6 }),
    keys(m, 13.85, ['Shift', 'F5'], { dur: 1.0 }),
  )
  out.push(
    caption(m, S[0], 1.3, 'Present mode', 'Press F5 to present the map, one node at a time.'),
    caption(
      m,
      1.1,
      S[1],
      'Present mode',
      'The centre, then each branch clockwise, then into them. Earlier steps dim.',
      { dark: true },
    ),
    caption(
      m,
      S[1],
      13.4,
      'Notes and a blank screen',
      'N shows the notes of this step; B blanks the screen, B brings it back.',
      { dark: true },
    ),
    caption(m, 13.3, 14.5, 'Present from here', 'Shift+F5 starts presenting at the selected node.'),
    caption(
      m,
      14.4,
      S[2],
      'Present from here',
      'Shift+F5 starts presenting at the selected node.',
      { dark: true },
    ),
  )

  /* --- scene 3: an exported HTML page presents too --- */
  {
    const s = 778 / 960
    const local = sampleMap(170)
    const localStage = { x: 30, y: 24, w: 900, h: 270, clip: { x: 0, y: 0, w: 960, h: 395 } }
    const present = button(820, 16, '▶ Present', { primary: true, size: 13, h: 30 })
    const content = [
      rect(0, 0, 960, 395, { fill: C.paper }),
      text(24, 36, 'Launch plan', { size: 17, weight: 700 }),
      present.svg,
      lightMap(local),
      m.ag({ o: on(16.7, 0.4) }, [
        rect(0, 0, 960, 395, { fill: C.night }),
        presentStage(m, {
          tree: local.tree,
          order: local.order,
          steps: [
            { n: local.root, t: 17.1 },
            { n: local.pricing, t: 18.3 },
            { n: local.hiring, t: 19.5 },
          ],
          end: S[3],
          stage: localStage,
          hudY: 330,
        }),
      ]),
    ]
    out.push(
      m.ag({ o: show(S[2], S[3]) }, [
        browser(90, 104, 780, 362, 'launch-plan.html · opened from a file', {
          filter: `url(#${m.id}-shadow)`,
        }),
        g({ transform: `translate(91 145) scale(${s.toFixed(5)})` }, content),
      ]),
    )
    out.push(
      keys(m, 16.5, ['F5'], { dur: 1.0 }),
      keys(m, 18.15, ['→'], { dur: 0.8 }),
      keys(m, 19.35, ['→'], { dur: 0.8 }),
      caption(
        m,
        S[2],
        S[3],
        'Present an exported page',
        'An exported HTML file presents the same way: no app, no network.',
      ),
    )
  }

  out.push(progressBar(m, S.slice(1, -1)))
  return m.render(out.join('\n'))
}
