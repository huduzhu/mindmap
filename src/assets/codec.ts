import { browserCodec, type DecodedImage, type ImageCodec } from './process'

/**
 * The image codec every lazily loaded image path uses (#149): adding pictures,
 * and taking asset files in from the sync folder, backups, ZIP imports and
 * GitHub. Tests put in one that needs no canvas.
 */
const browser = browserCodec as unknown as ImageCodec<DecodedImage>
let codec: ImageCodec<DecodedImage> = browser

export function imageCodec(): ImageCodec<DecodedImage> {
  return codec
}

/** Tests: decode and encode without a real canvas (null puts the browser's back). */
export function setImageCodec(next: ImageCodec<DecodedImage> | null): void {
  codec = next ?? browser
}
