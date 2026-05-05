import { parseAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';

import { resolveMirrorAttachmentPath } from './attachmentPathReference.js';

const MARKDOWN_LINK_PATTERN = /(!?\[[^\]\n]*\]\()([^)\n]+)(\))/g;

function unwrapMarkdownDestination(destination: string) {
  const trimmed = destination.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return { hasAngleBrackets: true, value: trimmed.slice(1, -1) };
  }
  return { hasAngleBrackets: false, value: trimmed };
}

function formatMarkdownDestination(rawDestination: string, nextPath: string) {
  const wrapped = unwrapMarkdownDestination(rawDestination);
  return wrapped.hasAngleBrackets ? `<${nextPath}>` : nextPath;
}

export function rewriteMirrorMarkdownAttachmentPaths(content: string) {
  return content.replace(MARKDOWN_LINK_PATTERN, (match, prefix, rawDestination, suffix) => {
    const wrapped = unwrapMarkdownDestination(rawDestination);
    const attachmentId = parseAssetMarkdownUrl(wrapped.value);
    if (!attachmentId) {
      return match;
    }

    const absolutePath = resolveMirrorAttachmentPath(attachmentId);
    if (!absolutePath) {
      return match;
    }

    return `${prefix}${formatMarkdownDestination(rawDestination, absolutePath)}${suffix}`;
  });
}
