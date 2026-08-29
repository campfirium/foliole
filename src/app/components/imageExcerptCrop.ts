import type { ImageExcerptRegionRect } from '../../features/editor/model/imageExcerptRegionSelection';

export async function renderImageExcerptCrop(image: HTMLImageElement, rect: ImageExcerptRegionRect) {
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error('The source image is not ready.');
  }
  const sourceX = Math.round(rect.x * image.naturalWidth);
  const sourceY = Math.round(rect.y * image.naturalHeight);
  const sourceWidth = Math.max(1, Math.round(rect.width * image.naturalWidth));
  const sourceHeight = Math.max(1, Math.round(rect.height * image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The image excerpt could not be rendered.');
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The image excerpt could not be encoded.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function encodeImageExcerptBytes(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function hashImageExcerptBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
