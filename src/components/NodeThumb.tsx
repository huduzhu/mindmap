import { useThumbUrl } from '../assets/useThumb'
import { thumbSize } from '../map/image'
import type { NodeImage } from '../schema/types'
import { useT } from '../i18n'

/**
 * A node's picture on the map and while presenting (#149, HC5): the cached
 * ≤256 px thumbnail at most 220 px wide, in a box sized from the image's w/h
 * so nothing moves when it loads. While it loads the box stays empty; when the
 * asset is not here (yet), it says so. With `onOpen` a click opens it; it is
 * not a button, so it never keeps keyboard focus from the map (Space and
 * Shift+Space open it from the keyboard).
 */
export function NodeThumb({
  image,
  className = '',
  onOpen,
  testId,
}: {
  image: NodeImage
  className?: string
  onOpen?: () => void
  testId?: string
}) {
  const t = useT()
  const url = useThumbUrl(image.asset)
  const { width, height } = thumbSize(image)
  return (
    <span
      className={`node-thumb${url ? '' : ' node-thumb-empty'}${onOpen ? ' node-thumb-open' : ''} ${className}`}
      style={{ width, height }}
      title={onOpen ? t('canvas.viewImage') : undefined}
      data-testid={testId}
      onClick={
        onOpen &&
        ((event) => {
          event.stopPropagation()
          onOpen()
        })
      }
    >
      {url ? (
        <img src={url} alt={image.alt ?? ''} draggable={false} width={width} height={height} />
      ) : (
        <span className="node-thumb-missing" data-testid={testId && `${testId}-missing`}>
          {url === null ? t('img.unavailable') : ''}
        </span>
      )}
    </span>
  )
}
