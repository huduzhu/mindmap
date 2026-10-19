import { registerMessages } from '../index'

/**
 * English text used only by the image code that loads on demand (#149, H-0
 * area): adding pictures, the lightbox and the image markers in Outline and
 * Brainstorm rows. It ships in those chunks, not the startup bundle.
 */
export const imagesMessages = {
  'img.notImage': 'This file is not a picture the app can use (PNG, JPEG, WebP, GIF or AVIF).',
  'img.tooLarge': 'This picture is {size} MB; pictures up to {max} MB can be added.',
  'img.tooLargeAfter': 'Even scaled down this picture is {size} MB; the limit is 2 MB.',
  'img.unreadable': 'This picture could not be read.',
  'img.storageFull': 'Browser storage is full, so the picture was not added.',
  'img.failed': 'The picture could not be added: {error}',
  'img.nodeTitle': 'Image',
  'img.dialogTitle': 'Image of {title}',
  'img.close': 'Close (Esc)',
  'img.zoomIn': 'Zoom in (+)',
  'img.zoomOut': 'Zoom out (−)',
  'img.fit': 'Fit (0)',
  'img.zoom': 'Zoom {percent}%',
  'img.help': 'Scroll or pinch to zoom, drag to move, 0 fits the picture.',
  'img.loading': 'Loading the picture…',
  'img.size': '{w} × {h} px',
  'img.alt': 'Description',
  'img.altHint':
    'What the picture shows, for screen readers and exports. Saved when you leave the field.',
  'img.altPlaceholder': 'Describe the picture…',
  'img.replace': 'Replace…',
  'img.remove': 'Remove image',
  'img.marker': 'Open the image',
  'img.markerWithAlt': 'Open the image: {alt}',
  'img.field': 'Picture',
} as const

registerMessages(imagesMessages)
