import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { loadThumbUrl, peekThumbUrl, watchThumb } from './thumbs'

const noop = () => undefined

/**
 * The thumbnail URL of an asset for a mounted component (#149): undefined
 * while it loads, null when the asset is not here (yet). Only the cached
 * ≤256 px thumbnail is decoded, never the full image.
 */
export function useThumbUrl(hash: string | undefined): string | null | undefined {
  const subscribe = useCallback(
    (listener: () => void) => (hash ? watchThumb(hash, listener) : noop),
    [hash],
  )
  const url = useSyncExternalStore(subscribe, () => (hash ? peekThumbUrl(hash) : undefined))
  useEffect(() => {
    if (hash && url === undefined) void loadThumbUrl(hash)
  }, [hash, url])
  return url
}
