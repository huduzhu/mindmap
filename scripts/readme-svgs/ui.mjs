/** Shared interface pieces for the README movies. */
import {
  C,
  circle,
  drawNode,
  edge,
  el,
  g,
  move,
  path,
  pill,
  rect,
  ring,
  show,
  text,
  textWidth,
} from '../svg-movie.mjs'

/** View tabs in the title bar; `active` is a list of [label, from, to]. */
export function viewTabs(m, labels, active) {
  let x = m.width - 16
  const parts = []
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i]
    const w = textWidth(label, 12, 600) + 20
    x -= w
    const lit = active
      .filter(([name]) => name === label)
      .map(([, a, b]) =>
        m.ag({ o: show(a, b, 0.25) }, [
          rect(x, 7, w, 21, { rx: 6, fill: C.blue }),
          text(x + w / 2, 21.5, label, { size: 12, weight: 600, fill: C.white, anchor: 'middle' }),
        ]),
      )
      .join('')
    parts.unshift(
      text(x + w / 2, 21.5, label, { size: 12, weight: 600, fill: C.mute, anchor: 'middle' }) + lit,
    )
    x -= 4
  }
  return parts.join('')
}

/** A rounded card with a header, used for panes and panels. */
export function card(x, y, w, h, title, o = {}) {
  return [
    rect(x, y, w, h, { rx: 12, fill: o.fill ?? C.white, stroke: C.line, filter: o.filter }),
    title ? text(x + 18, y + 28, title, { size: 15, weight: 700 }) : '',
    title ? path(`M${x + 1} ${y + 42.5}H${x + w - 1}`, { stroke: C.rule }) : '',
  ].join('')
}

/** A small vector illustration used as the pasted picture. */
export function picture(x, y, w, h) {
  const id = `pic${Math.round(x)}${Math.round(y)}`
  return [
    el('clipPath', { id }, rect(x, y, w, h, { rx: Math.min(w, h) * 0.08 })),
    g({ 'clip-path': `url(#${id})` }, [
      rect(x, y, w, h, { fill: C.blueSoft }),
      circle(x + w * 0.76, y + h * 0.3, h * 0.13, { fill: C.amber }),
      path(
        `M${x} ${y + h}L${x + w * 0.3} ${y + h * 0.45}L${x + w * 0.52} ${y + h * 0.78}L${x + w * 0.66} ${y + h * 0.6}L${x + w} ${y + h}Z`,
        {
          fill: C.teal,
        },
      ),
      path(`M${x + w * 0.18} ${y + h}L${x + w * 0.42} ${y + h * 0.62}L${x + w * 0.7} ${y + h}Z`, {
        fill: C.blue,
        opacity: 0.85,
      }),
    ]),
  ].join('')
}

export function checkbox(x, y, checked) {
  return checked
    ? rect(x, y, 14, 14, { rx: 3.5, fill: C.teal }) +
        path(`M${x + 3.2} ${y + 7.2}L${x + 6} ${y + 10}L${x + 11} ${y + 4.2}`, {
          stroke: C.white,
          sw: 2,
        })
    : rect(x + 0.5, y + 0.5, 13, 13, { rx: 3.5, fill: C.white, stroke: C.faint, sw: 1.3 })
}

/** A tiny app window with a project title and save status. */
export function miniApp(m, x, y, w, h, title) {
  return [
    rect(x, y, w, h, { rx: 9, fill: C.white, stroke: C.line }),
    path(`M${x} ${y + 26.5}H${x + w}`, { stroke: C.rule }),
    circle(x + 12, y + 13.5, 3.2, { fill: C.line }),
    circle(x + 22, y + 13.5, 3.2, { fill: C.line }),
    text(x + 34, y + 18, title, { size: 12, weight: 600, fill: C.mute }),
  ].join('')
}

export function fileIcon(x, y, color = C.mute) {
  return (
    path(`M${x} ${y}h8l4 4v12h-12z`, { stroke: color, sw: 1.3, join: 'round' }) +
    path(`M${x + 8} ${y}v4h4`, { stroke: color, sw: 1.3 })
  )
}

export function folderIcon(x, y, color = C.blue) {
  return path(`M${x} ${y + 2}h6l2 2.5h9v11.5h-17z`, {
    fill: C.blueSoft,
    stroke: color,
    sw: 1.3,
    join: 'round',
  })
}

/** A button; returns `{ w, h, svg }`. */
export function button(x, y, label, o = {}) {
  const size = o.size ?? 12.5
  const w = o.w ?? textWidth(label, size, 600) + 24
  const h = o.h ?? 28
  const fill = o.primary ? C.blue : (o.fill ?? C.white)
  const color = o.primary ? C.white : (o.color ?? C.ink)
  return {
    w,
    h,
    svg: [
      rect(x, y, w, h, { rx: 7, fill, stroke: o.primary ? C.blue : (o.stroke ?? C.line) }),
      text(x + w / 2, y + h / 2 + size * 0.36, label, {
        size,
        weight: 600,
        fill: color,
        anchor: 'middle',
      }),
    ].join(''),
  }
}

/** A browser window with three dots and an address bar showing `url`. */
export function browser(x, y, w, h, url, o = {}) {
  return [
    rect(x, y, w, h, { rx: 10, fill: o.fill ?? C.white, stroke: C.line, filter: o.filter }),
    path(`M${x + 1} ${y + 40.5}H${x + w - 1}`, { stroke: C.rule }),
    circle(x + 16, y + 20.5, 4, { fill: C.line }),
    circle(x + 29, y + 20.5, 4, { fill: C.line }),
    circle(x + 42, y + 20.5, 4, { fill: C.line }),
    rect(x + 58, y + 9, w - 74, 23, { rx: 11.5, fill: C.soft }),
    text(x + 74, y + 25, url, { size: 12, fill: C.mute }),
  ].join('')
}

/** A dark toast centred on `cx`; an array of lines wraps it, as the app's toasts wrap. */
export function toast(cx, y, value, o = {}) {
  const size = o.size ?? 13
  if (Array.isArray(value)) {
    // Estimates run a little short for long lines, so wrapped toasts get extra room.
    const w = Math.max(...value.map((line) => textWidth(line, size))) * 1.08 + 40
    const h = 16 + value.length * (size + 6)
    return [
      rect(cx - w / 2, y, w, h, { rx: 9, fill: o.fill ?? C.ink }),
      ...value.map((line, i) =>
        text(cx, y + 8 + (i + 1) * (size + 6) - 5, line, {
          size,
          fill: o.color ?? C.white,
          anchor: 'middle',
        }),
      ),
    ].join('')
  }
  const w = textWidth(value, size) + 36
  return [
    rect(cx - w / 2, y, w, 34, { rx: 9, fill: o.fill ?? C.ink }),
    text(cx, y + 21.5, value, { size, fill: o.color ?? C.white, anchor: 'middle' }),
  ].join('')
}

/**
 * Present mode as src/present/steps.ts runs it. `order` is every node in
 * presentation order (the root, its children clockwise, then depth first);
 * `steps` are the moments shown, `{ n, t }`. Each step reveals the nodes up
 * to it, lights the current node, its ancestors and its group (the node whose
 * children are being revealed), dims the rest to 0.4 and fits the camera to
 * the group and its revealed children. The HUD (‹ n / total › ×) shows for
 * two seconds after each step, as HUD_MS does.
 */
export function presentStage(m, { tree, order, steps, end, stage, hudY = stage.y + stage.h + 6 }) {
  const parentOf = new Map(tree.map(([a, b]) => [b, a]))
  const fit = (nodes) => {
    const x0 = Math.min(...nodes.map((n) => n.x)) - 40
    const x1 = Math.max(...nodes.map((n) => n.r)) + 40
    const y0 = Math.min(...nodes.map((n) => n.y)) - 40
    const y1 = Math.max(...nodes.map((n) => n.b)) + 40
    const s = Math.min(1.35, stage.w / (x1 - x0), stage.h / (y1 - y0))
    return [
      stage.x + stage.w / 2 - s * ((x0 + x1) / 2),
      stage.y + stage.h / 2 - s * ((y0 + y1) / 2),
      s,
    ]
  }
  const camKeys = []
  const states = new Map(order.map((n) => [n, []]))
  for (const step of steps) {
    const index = order.indexOf(step.n)
    const revealed = new Set(order.slice(0, index + 1))
    const group = parentOf.get(step.n) ?? step.n
    const lit = new Set([step.n, group])
    for (let p = parentOf.get(step.n); p; p = parentOf.get(p)) lit.add(p)
    for (const n of order)
      states.get(n).push([step.t, revealed.has(n) ? (lit.has(n) ? 1 : 0.4) : 0])
    const kids = [...revealed].filter((n) => parentOf.get(n) === group)
    const cam = fit([group, ...kids])
    const prev = camKeys.length ? camKeys[camKeys.length - 1][1] : cam
    camKeys.push([step.t, prev], [step.t + 0.9, cam])
  }
  const night = { fill: C.nightNode, stroke: C.nightLine, color: C.nightText }
  const nodes = order.map((n) => {
    const keysOut = [[steps[0].t - 0.4, 0]]
    let prev = 0
    for (const [t, v] of states.get(n)) {
      keysOut.push([t, prev], [t + 0.45, v])
      prev = v
    }
    const parent = parentOf.get(n)
    return m.ag({ o: keysOut }, [
      parent ? edge(parent, n, { stroke: C.nightLine, sw: 1.8 }) : '',
      drawNode(n, parent ? { style: night } : {}),
    ])
  })
  const rings = steps.map((step, k) => {
    const until = k + 1 < steps.length ? steps[k + 1].t : end
    return m.ag({ o: show(step.t + 0.2, until + 0.1, 0.25) }, ring(step.n, C.sky))
  })
  const clip = m.uid('stage')
  const huds = steps.map((step, k) => {
    const until = Math.min(step.t + 2, k + 1 < steps.length ? steps[k + 1].t : end)
    const n = order.indexOf(step.n) + 1
    const total = order.length
    return m.ag({ o: show(step.t, until, 0.2) }, [
      rect(380, hudY, 200, 34, { rx: 17, fill: C.nightNode, stroke: C.nightLine }),
      rect(396, hudY + 4, 168, 3, { rx: 1.5, fill: C.nightLine }),
      rect(396, hudY + 4, (168 * n) / total, 3, { rx: 1.5, fill: C.sky }),
      text(408, hudY + 24, '‹', { size: 17, fill: C.nightText, anchor: 'middle' }),
      text(480, hudY + 23, `${n} / ${total}`, {
        size: 13,
        fill: C.nightText,
        anchor: 'middle',
        weight: 600,
      }),
      text(532, hudY + 24, '›', { size: 17, fill: C.nightText, anchor: 'middle' }),
      text(560, hudY + 23.5, '×', { size: 15, fill: C.nightText, anchor: 'middle' }),
    ])
  })
  return [
    el('clipPath', { id: clip }, rect(stage.clip.x, stage.clip.y, stage.clip.w, stage.clip.h)),
    g({ 'clip-path': `url(#${clip})` }, m.ag({ t: camKeys }, [...nodes, ...rings])),
    ...huds,
  ].join('')
}

/** A night-style notes card (present mode); `lines` are plain text. */
export function notesCard(x, y, w, title, lines) {
  const h = 44 + lines.length * 24
  return [
    rect(x, y, w, h, { rx: 12, fill: C.nightNode, stroke: C.nightLine }),
    text(x + 20, y + 26, title, { size: 12, weight: 700, fill: C.sky }),
    ...lines.map((line, i) => text(x + 20, y + 52 + i * 24, line, { size: 14, fill: C.nightText })),
  ].join('')
}

/** A labelled tag pill (amber). */
export const tagChip = (x, y, tag, size = 10.5) =>
  pill(x, y, tag, { fill: C.amberSoft, color: C.amber, size, h: size + 6 })

/** Re-exported for movies that slide panels in. */
export const slideIn = (a, b, dx, dy) => move(a, b, [dx, dy], [0, 0])
