/**
 * A tiny toolkit for the animated README SVGs (npm run readme-svgs).
 *
 * A "movie" is one standalone SVG whose elements carry CSS @keyframes. Every
 * animated element gets its own class; its keyframes are written in seconds
 * and converted to percentages of the loop. The class's static style is the
 * state at the movie's poster time, so a viewer that does not run CSS
 * animations, or a user who prefers reduced motion, sees one readable frame.
 *
 * No dependencies, no randomness: the same input always gives the same file.
 */

export const FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
export const MONO = "ui-monospace, 'SF Mono', Consolas, Menlo, monospace"

/** The palette: ink, brand blue, teal (done), amber (highlight), plus neutrals and tints. */
export const C = {
  ink: '#0f172a',
  blue: '#1d4ed8',
  teal: '#0f766e',
  amber: '#b45309',
  mute: '#475569',
  faint: '#94a3b8',
  line: '#cbd5e1',
  rule: '#e2e8f0',
  soft: '#f1f5f9',
  paper: '#f8fafc',
  white: '#ffffff',
  blueSoft: '#dbeafe',
  tealSoft: '#ccfbf1',
  amberSoft: '#fef3c7',
  night: '#0b1220',
  nightNode: '#1e293b',
  nightLine: '#475569',
  nightText: '#e2e8f0',
  sky: '#93c5fd',
}

export const FADE = 0.35
const EASE = 'cubic-bezier(0.45, 0, 0.2, 1)'

export const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const num = (n) => {
  const r = Math.round(n * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

/** An element; `children` undefined makes it self-closing. Children are trusted markup. */
export function el(name, attrs = {}, children) {
  const list = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? num(v) : esc(v)}"`)
    .join('')
  if (children === undefined) return `<${name}${list}/>`
  return `<${name}${list}>${Array.isArray(children) ? children.join('') : children}</${name}>`
}

export const g = (attrs, children) => el('g', attrs, children)

export function text(x, y, value, o = {}) {
  return el(
    'text',
    {
      x,
      y,
      'font-size': o.size ?? 14,
      'font-weight': o.weight,
      fill: o.fill ?? C.ink,
      'text-anchor': o.anchor,
      class: o.mono ? 'mono' : o.cls,
      'font-style': o.italic ? 'italic' : undefined,
      opacity: o.opacity,
      // Inline, so it wins over the stylesheet's default font.
      style: o.family ? `font-family:${o.family}` : undefined,
    },
    esc(value),
  )
}

export const rect = (x, y, w, h, o = {}) =>
  el('rect', {
    x,
    y,
    width: w,
    height: h,
    rx: o.rx,
    fill: o.fill ?? 'none',
    stroke: o.stroke,
    'stroke-width': o.sw,
    'stroke-dasharray': o.dash,
    opacity: o.opacity,
    'fill-opacity': o.fillOpacity,
    filter: o.filter,
  })

export const circle = (cx, cy, r, o = {}) =>
  el('circle', {
    cx,
    cy,
    r,
    fill: o.fill ?? 'none',
    stroke: o.stroke,
    'stroke-width': o.sw,
    opacity: o.opacity,
  })

export const path = (d, o = {}) =>
  el('path', {
    d,
    fill: o.fill ?? 'none',
    stroke: o.stroke,
    'stroke-width': o.sw,
    'stroke-linecap': o.cap ?? 'round',
    'stroke-linejoin': o.join,
    'stroke-dasharray': o.dash,
    pathLength: o.pathLength,
    opacity: o.opacity,
    mask: o.mask,
  })

/* ---------- text measurement (an estimate for system sans-serif fonts) ---------- */

function charWidth(ch) {
  if (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch)) return 1
  if (/\p{Extended_Pictographic}/u.test(ch)) return 1.3
  if (/[\ufe0f\u200d]/.test(ch)) return 0
  if ("iljI.,:;|!'’`".includes(ch)) return 0.27
  if (' '.includes(ch)) return 0.3
  if ('frt()[]{}/-'.includes(ch)) return 0.37
  if ('mwMW'.includes(ch)) return 0.86
  if ('#@%&'.includes(ch)) return 0.74
  if ('…→←↑↓▾›×+−'.includes(ch)) return 0.62
  if (/[A-Z]/.test(ch)) return 0.66
  if (/[0-9]/.test(ch)) return 0.56
  return 0.54
}

export const textWidth = (value, size, weight = 400) =>
  [...value].reduce((w, ch) => w + charWidth(ch), 0) * size * (weight >= 600 ? 1.06 : 1)

export const monoWidth = (value, size) => [...value].length * size * 0.61

/* ---------- keyframe tracks ---------- */

/** Visible from `a` to `b`, fading in and out over `f` seconds. */
export const show = (a, b, f = FADE) => [
  [a, 0],
  [a + f, 1],
  [b - f, 1],
  [b, 0],
]
/** Appears at `a` and stays (the scene around it hides it later). */
export const on = (a, f = FADE) => [
  [a, 0],
  [a + f, 1],
]
/** Disappears at `a`. */
export const off = (a, f = FADE) => [
  [a, 1],
  [a + f, 0],
]
/** A translate/scale move from `p` to `q` between `a` and `b`. */
export const move = (a, b, p, q) => [
  [a, p],
  [b, q],
]
/** The [x, y, s] transform that scales by `s` around the point (cx, cy). */
export const about = (cx, cy, s) => [cx * (1 - s), cy * (1 - s), s]

function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    if (t <= t1) {
      const [t0, v0] = keys[i - 1]
      const k = t1 === t0 ? 1 : (t - t0) / (t1 - t0)
      if (Array.isArray(v0)) return v0.map((v, j) => v + (v1[j] - v) * k)
      return v0 + (v1 - v0) * k
    }
  }
  return keys[keys.length - 1][1]
}

const transformOf = (v) => {
  const [x, y, sx = 1, sy = sx] = v
  return `translate(${num(x)}px,${num(y)}px) scale(${num(sx)},${num(sy)})`
}

export class Movie {
  /**
   * @param {{id: string, width: number, height: number, duration: number, poster: number,
   *   title: string, desc: string}} o
   */
  constructor(o) {
    Object.assign(this, o)
    this.css = []
    this.count = 0
    this.ids = 0
  }

  /** A unique id for clip paths and masks. */
  uid(kind) {
    this.ids += 1
    return `${this.id}-${kind}${this.ids}`
  }

  /**
   * A class animating opacity (`o`), transform (`t`, [x, y, sx, sy?]) and/or
   * stroke-dashoffset (`d`). Keys are [seconds, value] pairs.
   */
  cls({ o, t, d, linear = false }) {
    this.count += 1
    const name = `${this.id}${this.count}`
    const animations = []
    const base = []
    const add = (suffix, keys, prop, format) => {
      const sorted = [...keys].sort((p, q) => p[0] - q[0])
      const full = [...sorted]
      if (full[0][0] > 0) full.unshift([0, full[0][1]])
      if (full[full.length - 1][0] < this.duration)
        full.push([this.duration, full[full.length - 1][1]])
      const frames = []
      let last = -1
      for (const [time, value] of full) {
        let pct = Math.max(0, Math.min(100, (time / this.duration) * 100))
        if (pct <= last) pct = last + 0.001
        last = pct
        frames.push(`${Math.round(pct * 1000) / 1000}%{${prop}:${format(value)}}`)
      }
      this.css.push(`@keyframes ${name}${suffix}{${frames.join('')}}`)
      animations.push(`${name}${suffix} ${this.duration}s ${linear ? 'linear' : EASE} infinite`)
      base.push(`${prop}:${format(sample(sorted, this.poster))}`)
    }
    if (o) add('o', o, 'opacity', num)
    if (t) add('t', t, 'transform', transformOf)
    if (d) add('d', d, 'stroke-dashoffset', num)
    this.css.push(`.${name}{${base.join(';')};animation:${animations.join(',')}}`)
    return name
  }

  /** A group animated with `tracks`. */
  ag(tracks, children, attrs = {}) {
    return g({ ...attrs, class: this.cls(tracks) }, children)
  }

  render(body) {
    const style = [
      `svg,text{font-family:${FONT}}`,
      `.mono{font-family:${MONO}}`,
      `g,path,rect,circle,text{transform-box:view-box;transform-origin:0 0}`,
      ...this.css,
      `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`,
    ].join('\n')
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" role="img" aria-labelledby="${this.id}-title ${this.id}-desc">`,
      `<title id="${this.id}-title">${esc(this.title)}</title>`,
      `<desc id="${this.id}-desc">${esc(this.desc)}</desc>`,
      `<defs><filter id="${this.id}-shadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#0f172a" flood-opacity="0.16"/></filter></defs>`,
      `<style>\n${style}\n</style>`,
      body,
      `</svg>`,
      '',
    ].join('\n')
  }
}

/* ---------- shared pieces: window, captions, keycaps, pointer, typing ---------- */

/** The app window behind every movie: title bar, app name, optional right-hand items. */
export function windowBack(m, right = '') {
  const { width: w, height: h } = m
  return [
    rect(0.5, 0.5, w - 1, h - 1, { rx: 14, fill: C.white, stroke: C.line }),
    path(`M0.5 34V14.5A14 14 0 0 1 14.5 0.5H${w - 14.5}A14 14 0 0 1 ${w - 0.5} 14.5V34Z`, {
      fill: C.soft,
    }),
    path(`M0.5 34.5H${w - 0.5}`, { stroke: C.rule, sw: 1 }),
    circle(22, 17.5, 5, { fill: C.line }),
    circle(39, 17.5, 5, { fill: C.line }),
    circle(56, 17.5, 5, { fill: C.line }),
    text(76, 22.5, 'Mind Map Studio', { size: 13, weight: 600, fill: C.mute }),
    right,
  ].join('')
}

/** The loop's progress bar with a notch at each scene boundary. */
export function progressBar(m, boundaries = []) {
  const w = m.width - 48
  const notches = boundaries
    .map((t) => rect(24 + (t / m.duration) * w - 1.5, m.height - 15, 3, 6, { fill: C.white }))
    .join('')
  return [
    rect(24, m.height - 14, w, 4, { rx: 2, fill: C.rule }),
    g({ transform: `translate(24 ${m.height - 14})` }, [
      m.ag(
        {
          t: [
            [0, [0, 0, 0, 1]],
            [m.duration, [0, 0, 1, 1]],
          ],
          linear: true,
        },
        rect(0, 0, w, 4, { rx: 2, fill: C.blue }),
      ),
    ]),
    notches,
  ].join('')
}

/** The scene title and one-line explanation at the top left. */
export function caption(m, a, b, title, sub, { dark = false } = {}) {
  return m.ag({ o: show(a, b) }, [
    text(32, 68, title, { size: 21, weight: 700, fill: dark ? C.white : C.ink }),
    text(32, 91, sub, { size: 14, fill: dark ? C.line : C.mute }),
  ])
}

/** One keycap; returns its markup and width. */
export function keycap(x, y, label, { size = 13, h = 26 } = {}) {
  const w = Math.max(h + 2, monoWidth(label, size) + 16)
  return {
    w,
    svg: [
      rect(x, y + 2, w, h, { rx: 6, fill: C.line }),
      rect(x, y, w, h, { rx: 6, fill: C.white, stroke: C.faint, sw: 1 }),
      text(x + w / 2, y + h / 2 + size * 0.36, label, {
        size,
        mono: true,
        anchor: 'middle',
        weight: 600,
      }),
    ].join(''),
  }
}

/** A row of keycaps joined by "+", right-aligned at `right`, shown at `t`. */
export function keys(m, t, labels, { dur = 1.3, right = m.width - 32, y = 50, dark = false } = {}) {
  const parts = []
  let x = right
  for (let i = labels.length - 1; i >= 0; i--) {
    const probe = keycap(0, 0, labels[i])
    x -= probe.w
    parts.unshift(keycap(x, y, labels[i]).svg)
    if (i > 0) {
      x -= 18
      parts.unshift(
        text(x + 9, y + 18, '+', {
          size: 14,
          anchor: 'middle',
          fill: dark ? C.line : C.mute,
          weight: 600,
        }),
      )
    }
  }
  return m.ag({ o: show(t, t + dur, 0.15), t: move(t, t + 0.2, [0, 6], [0, 0]) }, parts)
}

/** A small inline keycap for hints inside the UI. */
export function kbd(x, y, label) {
  const w = monoWidth(label, 11) + 10
  return {
    w,
    svg: [
      rect(x, y, w, 19, { rx: 4, fill: C.white, stroke: C.line }),
      text(x + w / 2, y + 13.5, label, { size: 11, mono: true, anchor: 'middle', fill: C.mute }),
    ].join(''),
  }
}

/** A mouse pointer gliding through `stops` ([time, x, y]), visible between the first and last. */
export function pointer(m, stops, until) {
  const t = stops.map(([time, x, y]) => [time, [x, y]])
  const first = stops[0][0]
  return m.ag({ o: show(first - 0.2, until, 0.2), t }, [
    path('M0 0V17.5L4.6 13.4L7.7 20.4L10.6 19.1L7.6 12.3H13.6Z', {
      fill: C.ink,
      stroke: C.white,
      sw: 1.4,
      join: 'round',
    }),
  ])
}

/** A click ripple at (x, y) at time `t`. */
export function ripple(m, t, x, y, color = C.blue) {
  return m.ag(
    { o: show(t, t + 0.5, 0.1), t: move(t, t + 0.45, about(x, y, 0.3), about(x, y, 1.2)) },
    circle(x, y, 16, { fill: color, opacity: 0.25 }),
  )
}

/**
 * Text that types itself between `t0` and `t1`: a background-coloured cover
 * with a caret slides off it, clipped to the text's own box.
 */
export function typed(m, x, y, value, t0, t1, o = {}) {
  const size = o.size ?? 14
  const w = (o.mono ? monoWidth(value, size) : textWidth(value, size, o.weight)) + 6
  const id = m.uid('clip')
  const top = y - size * 1.05
  const h = size * 1.5
  return [
    text(x, y, value, o),
    el('clipPath', { id }, rect(x - 3, top, w + 6, h)),
    g({ 'clip-path': `url(#${id})` }, [
      m.ag({ t: move(t0, t1, [0, 0], [w + 4, 0]), o: off(t1 + 0.15, 0.2) }, [
        rect(x - 2, top, w + 4, h, { fill: o.bg ?? C.white }),
        rect(x - 2, top + 2, 1.6, h - 4, { fill: o.caret ?? C.blue }),
      ]),
    ]),
  ].join('')
}

/* ---------- mind-map nodes and edges ---------- */

export const KIND = {
  root: {
    size: 15,
    weight: 700,
    h: 40,
    pad: 18,
    fill: C.blue,
    stroke: C.blue,
    color: C.white,
    rx: 12,
    sw: 1.5,
  },
  branch: {
    size: 14,
    weight: 600,
    h: 32,
    pad: 14,
    fill: C.white,
    stroke: C.blue,
    color: C.ink,
    rx: 9,
    sw: 1.5,
  },
  leaf: {
    size: 13,
    weight: 400,
    h: 28,
    pad: 12,
    fill: C.white,
    stroke: C.line,
    color: C.ink,
    rx: 8,
    sw: 1.2,
  },
}

/** Node geometry: give `x` (left), `right` or `center`, and `cy`; width from the label. */
export function N(label, kind, o) {
  const k = KIND[kind]
  const w =
    o.w ?? Math.ceil(textWidth(o.measure ?? label, k.size, k.weight) + 2 * k.pad + (o.extra ?? 0))
  const h = o.h ?? k.h
  const x = o.x ?? (o.right !== undefined ? o.right - w : o.center - w / 2)
  const cy = o.cy ?? o.top + h / 2
  return { label, kind, k, x, y: cy - h / 2, w, h, cx: x + w / 2, cy, r: x + w, b: cy + h / 2 }
}

/** Draw a node. `style` overrides colours; `dx` shifts the label. */
export function drawNode(n, o = {}) {
  const k = { ...n.k, ...o.style }
  const tx = n.x + k.pad + (o.dx ?? 0)
  const ty = o.ty ?? n.cy + k.size * 0.36
  return [
    rect(n.x, n.y, n.w, n.h, {
      rx: k.rx,
      fill: k.fill,
      stroke: k.stroke,
      sw: k.sw,
      filter: o.filter,
    }),
    o.label === false
      ? ''
      : text(tx, ty, n.label, { size: k.size, weight: k.weight, fill: k.color }),
  ].join('')
}

/** A selection ring around a node. */
export const ring = (n, color = C.blue, pad = 4) =>
  rect(n.x - pad, n.y - pad, n.w + 2 * pad, n.h + 2 * pad, {
    rx: n.k.rx + pad,
    stroke: color,
    sw: 2.5,
  })

/** The bezier from parent `a` to child `b`, on whichever side `b` sits. */
export function edgePath(a, b) {
  const right = b.cx > a.cx
  const x1 = right ? a.r : a.x
  const x2 = right ? b.x : b.r
  const mx = (x1 + x2) / 2
  return `M${num(x1)} ${num(a.cy)}C${num(mx)} ${num(a.cy)} ${num(mx)} ${num(b.cy)} ${num(x2)} ${num(b.cy)}`
}

export const edge = (a, b, o = {}) =>
  path(edgePath(a, b), { stroke: o.stroke ?? C.faint, sw: o.sw ?? 1.6, pathLength: o.pathLength })

/**
 * An edge that draws itself between `t0` and `t1`. It stays hidden until it
 * starts drawing: a fully offset dash still paints the round cap at its start.
 */
export function drawnEdge(m, a, b, t0, t1, o = {}) {
  return el('path', {
    d: edgePath(a, b),
    fill: 'none',
    stroke: o.stroke ?? C.faint,
    'stroke-width': o.sw ?? 1.6,
    'stroke-linecap': 'round',
    pathLength: 1,
    'stroke-dasharray': 1,
    class: m.cls({
      d: move(t0, t1, 1, 0),
      o: [
        [t0, 0],
        [t0 + 0.04, 1],
      ],
    }),
  })
}

/** A small pill with text, e.g. a badge or tag chip. */
export function pill(x, y, value, o = {}) {
  const size = o.size ?? 11
  const w = o.w ?? textWidth(value, size, o.weight ?? 600) + (o.padX ?? 8) * 2
  const h = o.h ?? size + 7
  return {
    w,
    h,
    svg: [
      rect(x, y, w, h, { rx: h / 2, fill: o.fill ?? C.blueSoft, stroke: o.stroke, sw: o.sw }),
      text(x + w / 2, y + h / 2 + size * 0.36, value, {
        size,
        weight: o.weight ?? 600,
        fill: o.color ?? C.blue,
        anchor: 'middle',
      }),
    ].join(''),
  }
}
