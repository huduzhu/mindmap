import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Preset } from '../schema/types'
import {
  buildInteractiveHtml,
  EXPORT_CONTENT_SECURITY_POLICY,
  dataUri,
  embeddedImages,
  escapeInlineScript,
  escapeInlineStyle,
} from './htmlExport'
import { blobBytes, getAsset } from '../assets/store'
import { storeTestImage } from '../test/fakeCodec'
import { resetDatabase } from '../test/resetDb'
import { makeProject } from '../test/fixtures'
import { useLocale } from '../i18n'

const preset: Preset = {
  kind: 'preset',
  schemaVersion: 1,
  name: 'default',
  palette: {
    background: '#ffffff',
    text: '#1f2937',
    mutedText: '#6b7280',
    nodeFill: '#f8fafc',
    nodeBorder: '#cbd5e1',
    edge: '#94a3b8',
    branchColors: ['#6366f1'],
  },
  roles: {},
  font: { family: 'system-ui', baseSize: 14, titleScale: 1.4 },
  edges: { curve: 'bezier', width: 1.5, dashed: false },
}

function mockFetch(js: string, css: string, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok,
      text: async () => (url.includes('.js') ? js : css),
    })),
  )
}

describe('buildInteractiveHtml', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('inlines viewer js, css, and project data into a standalone page', async () => {
    mockFetch('var MMS="$& marker";', '.mms-viewer{color:red}')
    const html = await buildInteractiveHtml(makeProject('Demo'), preset)

    expect(html).toContain('<meta name="viewport"')
    // Before any script, so it covers them all (#224).
    const csp = html.indexOf('<meta http-equiv="Content-Security-Policy"')
    expect(csp).toBeGreaterThan(-1)
    expect(csp).toBeLessThan(html.indexOf('<script'))
    expect(html).toContain(`content="${EXPORT_CONTENT_SECURITY_POLICY}"`)
    expect(EXPORT_CONTENT_SECURITY_POLICY).toContain("default-src 'none'")
    expect(EXPORT_CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval')
    expect(html).toContain('<title>Demo</title>')
    expect(html).toContain('.mms-viewer{color:red}')
    expect(html).toContain('var MMS="$& marker";')
    expect(html).toContain('window.__MMS_DATA__')
    expect(html).toContain('"kind":"project"')
  })

  it('includes project cross-links in the interactive data', async () => {
    mockFetch('1;', '')
    const project = makeProject('Linked')
    project.map.children = [{ id: 'target', title: 'Target', children: [] }]
    project.links = [{ from: project.map.id, to: 'target' }]
    const html = await buildInteractiveHtml(project, preset)

    expect(html).toContain('"links":[{"from":"m-root","to":"target"}]')
  })

  it('records the app language for the viewer (#99)', async () => {
    mockFetch('1;', '')
    useLocale.setState({ locale: 'zh-CN' })
    try {
      const html = await buildInteractiveHtml(makeProject('中文'), preset)
      expect(html).toContain('"locale":"zh-CN"')
    } finally {
      useLocale.setState({ locale: 'en' })
    }
  })

  it('escapes hostile titles so the script block cannot break out', async () => {
    mockFetch('1;', '')
    const hostile = '</script><script>alert(1)</script>'
    const html = await buildInteractiveHtml(makeProject(hostile), preset)

    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).toContain('&lt;/script&gt;')
    expect(html).toContain('\\u003c/script>')
    expect(html.match(/<script>/g)?.length).toBe(2)
  })

  it('keeps replacement patterns like $& literal in the title', async () => {
    mockFetch('1;', '')
    const html = await buildInteractiveHtml(makeProject('Cost $& co'), preset)
    expect(html).toContain('<title>Cost $&amp; co</title>')
  })

  it('treats token-looking user text as a literal, never as a slot', async () => {
    mockFetch('var viewer=1;', '.viewer-root{color:blue}')
    const html = await buildInteractiveHtml(makeProject('__MMS_CSS__'), preset)
    expect(html).toContain('<title>__MMS_CSS__</title>')
    expect(html).toContain('.viewer-root{color:blue}')
    expect(html).toContain('var viewer=1;')
  })

  it('embeds the resolved preset so the viewer is styled offline', async () => {
    mockFetch('1;', '')
    const html = await buildInteractiveHtml(makeProject('Demo'), preset)
    expect(html).toContain('"name":"default"')
    expect(html).toContain('#6366f1')
  })

  it('throws a clear error when viewer assets are missing', async () => {
    mockFetch('', '', false)
    await expect(buildInteractiveHtml(makeProject('Demo'), preset)).rejects.toThrow(/viewer assets/)
  })
})

describe('inline viewer escaping (#67)', () => {
  it('neutralises a closing tag inside the inlined viewer bundle', () => {
    expect(escapeInlineScript('const s = "</script>"; // </SCRIPT')).toBe(
      'const s = "<\\/script>"; // <\\/SCRIPT',
    )
    expect(escapeInlineStyle('a::after { content: "</style>" }')).toBe(
      'a::after { content: "<\\/style>" }',
    )
    expect(escapeInlineScript('a < b && c </d')).toBe('a < b && c </d')
  })
})

describe('pictures in the interactive HTML (#149)', () => {
  const realFetch = globalThis.fetch
  beforeEach(async () => {
    await resetDatabase()
    // The viewer's files, empty (set by hand: not every runner has vi.stubGlobal).
    globalThis.fetch = (async () => new Response('')) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('embeds the map’s pictures as data URIs and leaves out missing ones', async () => {
    const meta = await storeTestImage('html')
    const bytes = new Uint8Array(await blobBytes((await getAsset(meta.hash))!))
    const missing = `sha256-${'a'.repeat(64)}`
    const base = makeProject('Pics')
    const project = {
      ...base,
      map: {
        ...base.map,
        children: [
          { id: 'p1', title: 'Photo', image: { asset: meta.hash, w: 100, h: 50, alt: 'Bench' } },
          { id: 'p2', title: 'Gone', image: { asset: missing, w: 100, h: 50 } },
        ],
      },
    }
    const images = await embeddedImages(project)
    expect(Object.keys(images)).toEqual([meta.hash])
    const expected = `data:image/webp;base64,${btoa(String.fromCharCode(...bytes))}`
    expect(images[meta.hash]).toBe(expected)
    expect(await dataUri(new Blob([new Uint8Array([104, 105])], { type: 'text/plain' }))).toBe(
      'data:text/plain;base64,aGk=',
    )

    const html = await buildInteractiveHtml(project, preset)
    const data = JSON.parse(html.match(/window\.__MMS_DATA__ = (.*);\n/)![1]) as {
      images: Record<string, string>
    }
    expect(data.images).toEqual({ [meta.hash]: expected })
  })
})

describe('what the HTML export embeds (#176)', () => {
  it('leaves out the Brainstorm tree and bookkeeping fields', async () => {
    const { viewerProject } = await import('./htmlExport')
    const project = {
      ...makeProject('Plan'),
      sourceProjectId: 'secret-id',
      tags: ['private'],
      brainstorm: {
        id: 'b',
        title: 'Ideas',
        children: [{ id: 'c', title: 'SECRET salary numbers', notes: 'PRIVATE note' }],
      },
    }
    const embedded = JSON.stringify(viewerProject(project))
    expect(embedded).not.toContain('SECRET')
    expect(embedded).not.toContain('PRIVATE')
    expect(embedded).not.toContain('secret-id')
    expect(embedded).not.toContain('private')
    expect(viewerProject(project).map).toEqual(project.map)
  })
})
