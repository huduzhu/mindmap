import { t } from '../i18n'
import '../i18n/en/files'
import { MAX_ZIP_ENTRIES, zipStore as writeZip, type ZipEntry } from './zipWriter'

export { crc32, MAX_ZIP_ENTRIES, type ZipEntry } from './zipWriter'

export function zipStore(entries: ZipEntry[], timestamp = new Date()): Uint8Array<ArrayBuffer> {
  // More would wrap the count, and unzip would silently read fewer files.
  if (entries.length >= MAX_ZIP_ENTRIES) {
    throw new RangeError(
      t('zip.tooManyEntries', { count: entries.length, max: MAX_ZIP_ENTRIES - 1 }),
    )
  }
  return writeZip(entries, timestamp)
}
