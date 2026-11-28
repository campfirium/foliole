import { createBoundedCache } from '../../../shared/lib/boundedCache';
import type { ImageIntrinsicSize } from '../model/remoteImageDisplay';

const MAX_REMEMBERED_IMAGES = 512;

interface RememberedImage {
  resourceUrl: string;
  size: ImageIntrinsicSize;
}

// CodeMirror drops image DOM outside the viewport. Remounting at the known size keeps the scroll height stable.
const rememberedImages = createBoundedCache<string, RememberedImage>(MAX_REMEMBERED_IMAGES);

export function readRememberedImage(key: string) {
  return rememberedImages.get(key) ?? null;
}

export function rememberImage(key: string, widget: HTMLElement, resourceUrl: string) {
  const image = widget.querySelector<HTMLImageElement>('.cm-md-image-element');
  if (!image?.naturalWidth || !image.naturalHeight) return;
  rememberedImages.set(key, {
    resourceUrl,
    size: { height: image.naturalHeight, width: image.naturalWidth }
  });
}

export function forgetImage(key: string) {
  rememberedImages.delete(key);
}
