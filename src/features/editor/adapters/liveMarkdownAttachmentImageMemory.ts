import { createBoundedCache } from '../../../shared/lib/boundedCache';
import type { ImageIntrinsicSize } from '../model/remoteImageDisplay';

const MAX_REMEMBERED_ATTACHMENT_IMAGES = 512;

interface RememberedAttachmentImage {
  resourceUrl: string;
  size: ImageIntrinsicSize;
}

// CodeMirror drops image DOM outside the viewport. Remounting at the known size keeps the scroll height stable.
const rememberedImages = createBoundedCache<string, RememberedAttachmentImage>(MAX_REMEMBERED_ATTACHMENT_IMAGES);

export function readRememberedAttachmentImage(source: string) {
  return rememberedImages.get(source) ?? null;
}

export function rememberAttachmentImage(source: string, widget: HTMLElement, resourceUrl: string) {
  const image = widget.querySelector<HTMLImageElement>('.cm-md-image-element');
  if (!image?.naturalWidth || !image.naturalHeight) return;
  rememberedImages.set(source, {
    resourceUrl,
    size: { height: image.naturalHeight, width: image.naturalWidth }
  });
}

export function forgetAttachmentImage(source: string) {
  rememberedImages.delete(source);
}
