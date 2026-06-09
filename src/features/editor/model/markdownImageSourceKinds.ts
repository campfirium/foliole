import { ASSET_MARKDOWN_SCHEME } from '../../../../lib/platform/assetMarkdownUrl';
import { EXT_DOC_IMAGE_PROTOCOL_SCHEME } from '../../../../lib/platform/extDocImageProtocolUrl';
import { isSafeMarkdownDataImageUrl } from '../../../../lib/platform/markdownImageDataUrl';

export function isBrowserImageSource(value: string) {
  try {
    const parsed = new URL(value);
    return (
      isSafeMarkdownDataImageUrl(value) ||
      parsed.protocol === 'file:' ||
      parsed.protocol === `${EXT_DOC_IMAGE_PROTOCOL_SCHEME}:` ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:'
    );
  } catch {
    return false;
  }
}

export function isInternalImageSource(value: string) {
  return value.startsWith(ASSET_MARKDOWN_SCHEME);
}

export function isRelativeImageSource(value: string) {
  if (!value.trim() || value.startsWith('#')) {
    return false;
  }
  try {
    new URL(value);
    return false;
  } catch {
    return true;
  }
}
