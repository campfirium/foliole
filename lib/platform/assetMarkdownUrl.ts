const ASSET_MARKDOWN_SCHEME = 'asset://';

function resolveAssetExtension(originalName: string | null | undefined) {
  const trimmedName = originalName?.trim() ?? '';
  if (!trimmedName) {
    return '';
  }

  const fileName = trimmedName.split(/[\\/]/).pop() ?? trimmedName;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return '';
  }

  return fileName.slice(dotIndex);
}

export function buildAssetMarkdownUrl(attachmentId: string, originalName?: string | null) {
  return `${ASSET_MARKDOWN_SCHEME}${encodeURIComponent(attachmentId)}${resolveAssetExtension(originalName)}`;
}

export function parseAssetMarkdownUrl(resourceUrl: string) {
  if (!resourceUrl.startsWith(ASSET_MARKDOWN_SCHEME)) {
    return null;
  }

  const encodedValue = resourceUrl.slice(ASSET_MARKDOWN_SCHEME.length).trim();
  if (!encodedValue) {
    return null;
  }

  const decodedValue = (() => {
    try {
      return decodeURIComponent(encodedValue);
    } catch {
      return encodedValue;
    }
  })();
  const dotIndex = decodedValue.lastIndexOf('.');
  const attachmentId = dotIndex > 0 ? decodedValue.slice(0, dotIndex) : decodedValue;
  return attachmentId || null;
}

export { ASSET_MARKDOWN_SCHEME };
