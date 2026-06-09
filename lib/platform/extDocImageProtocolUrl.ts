export const EXT_DOC_IMAGE_PROTOCOL_SCHEME = 'foliole-ext-image';

const EXT_DOC_IMAGE_PROTOCOL_HOST = 'resource';

export interface ExtDocImageRenderUrlParts {
  documentAbsolutePath: string;
  imageDestination: string;
}

export function buildExtDocImageRenderUrl(parts: ExtDocImageRenderUrlParts) {
  const params = new URLSearchParams({
    documentPath: parts.documentAbsolutePath,
    imageDestination: parts.imageDestination
  });
  return `${EXT_DOC_IMAGE_PROTOCOL_SCHEME}://${EXT_DOC_IMAGE_PROTOCOL_HOST}/?${params.toString()}`;
}

export function parseExtDocImageRenderUrl(url: string): ExtDocImageRenderUrlParts | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${EXT_DOC_IMAGE_PROTOCOL_SCHEME}:` || parsed.host !== EXT_DOC_IMAGE_PROTOCOL_HOST) {
      return null;
    }
    const documentAbsolutePath = parsed.searchParams.get('documentPath')?.trim();
    const imageDestination = parsed.searchParams.get('imageDestination')?.trim();
    if (!documentAbsolutePath || !imageDestination) {
      return null;
    }
    return { documentAbsolutePath, imageDestination };
  } catch {
    return null;
  }
}
