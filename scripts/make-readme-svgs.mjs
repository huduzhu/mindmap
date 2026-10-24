#!/usr/bin/env node
/**
 * Writes the animated SVG "videos" that README.md shows, one per section, into
 * docs/, starting with the hero reel docs/tour.svg. Run with
 * `npm run readme-svgs`; the output is deterministic.
 *
 * Each movie lives in scripts/readme-svgs/<name>.mjs and is built with the
 * small toolkit in scripts/svg-movie.mjs. On-screen wording follows the
 * English interface text in src/i18n, so the animations show what the app
 * really says.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aiRoundtrip } from './readme-svgs/ai-roundtrip.mjs'
import { dataSafety } from './readme-svgs/data-safety.mjs'
import { exportAndShare } from './readme-svgs/export-and-share.mjs'
import { folderSync } from './readme-svgs/folder-sync.mjs'
import { presentAndPalette } from './readme-svgs/present-and-palette.mjs'
import { presentMode } from './readme-svgs/present-mode.mjs'
import { pwaOffline } from './readme-svgs/pwa-offline.mjs'
import { richNodes } from './readme-svgs/rich-nodes.mjs'
import { themesI18nTouch } from './readme-svgs/themes-i18n-touch.mjs'
import { tour } from './readme-svgs/tour.mjs'
import { viewsAndFocus } from './readme-svgs/views-and-focus.mjs'

const docs = (name) => join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', name)

/** README section → file, in the order the README shows them. */
const movies = [
  ['tour.svg', tour],
  ['views-and-focus.svg', viewsAndFocus],
  ['rich-nodes.svg', richNodes],
  ['present-mode.svg', presentMode],
  ['present-and-palette.svg', presentAndPalette],
  ['data-safety.svg', dataSafety],
  ['export-and-share.svg', exportAndShare],
  ['themes-i18n-touch.svg', themesI18nTouch],
  ['pwa-offline.svg', pwaOffline],
  ['folder-sync.svg', folderSync],
  ['ai-roundtrip.svg', aiRoundtrip],
]

for (const [file, make] of movies) writeFileSync(docs(file), make())
