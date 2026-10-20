import type { NodeImage, TreeNode } from '../schema/types'

/**
 * The image on a node (#149, file format 4): the small, always-loaded part.
 * The bytes live in the asset store (src/assets/store.ts) under `asset`; the
 * node only carries the hash, the stored size and the alt text, so the
 * project file and the undo history stay small.
 */

/** Longest side of a stored image (HC-D2). */
export const MAX_IMAGE_SIDE = 1600
export const MAX_ALT_LENGTH = 300
/** Widest a thumbnail shows on the map (HC-D3). */
export const THUMB_MAX_WIDTH = 220
/** Tallest a thumbnail shows on the map, so a tall screenshot cannot take over. */
export const THUMB_MAX_HEIGHT = 220

const ASSET_PATTERN = /^sha256-[0-9a-f]{64}$/

export function isAssetHash(value: unknown): value is string {
  return typeof value === 'string' && ASSET_PATTERN.test(value)
}

const isSide = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_IMAGE_SIDE

/**
 * The usable part of an image object from an imported or synced file: null
 * when the asset or size is unusable (the image is dropped, the project is
 * kept); unknown keys go and an over-long or non-text alt is cut or dropped.
 */
export function cleanImage(value: unknown): NodeImage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (!isAssetHash(raw.asset) || !isSide(raw.w) || !isSide(raw.h)) return null
  const image: NodeImage = { asset: raw.asset, w: raw.w, h: raw.h }
  const alt = typeof raw.alt === 'string' ? cleanAlt(raw.alt) : ''
  if (alt) image.alt = alt
  return image
}

/** Alt text as stored: trimmed, at most 300 characters. */
export function cleanAlt(alt: string): string {
  return alt.trim().slice(0, MAX_ALT_LENGTH)
}

/** The size a thumbnail takes on the map: at most 220 px wide (and tall), aspect kept. */
export function thumbSize(image: Pick<NodeImage, 'w' | 'h'>): { width: number; height: number } {
  const scale = Math.min(1, THUMB_MAX_WIDTH / image.w, THUMB_MAX_HEIGHT / image.h)
  return {
    width: Math.max(1, Math.round(image.w * scale)),
    height: Math.max(1, Math.round(image.h * scale)),
  }
}

/** Whether any node of `root` has a picture (offers the "with images" exports). */
export function treeHasImage(root: TreeNode | undefined): boolean {
  if (!root) return false
  return Boolean(root.image) || (root.children ?? []).some(treeHasImage)
}
