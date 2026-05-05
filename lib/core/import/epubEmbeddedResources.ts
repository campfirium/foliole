import { ASSET_MARKDOWN_SCHEME } from '../../platform/assetMarkdownUrl.js';

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\n]+)\)/g;

function parseMarkdownImageTarget(target: string) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return null;
  }
  if (trimmedTarget.startsWith('<')) {
    const closingIndex = trimmedTarget.indexOf('>');
    if (closingIndex > 0) {
      return {
        destination: trimmedTarget.slice(1, closingIndex)
      };
    }
  }
  const match = /^(\S+)(?:\s+.+)?$/.exec(trimmedTarget);
  if (!match) {
    return null;
  }
  return {
    destination: match[1]
  };
}

function isRemoteImageDestination(destination: string) {
  try {
    const parsedUrl = new URL(destination);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildVisibleFallbackLabel(altText: string, destination: string) {
  const label = altText.trim() || 'Image';
  return `[EPUB image not imported: ${label} (${destination})]`;
}

export function degradeUnmanagedEpubImages(content: string, managedDestinations: ReadonlySet<string> = new Set()) {
  const degradedTargets = new Set<string>();
  const rewrittenContent = content.replace(MARKDOWN_IMAGE_PATTERN, (fullMatch, altText: string, rawTarget: string) => {
    const parsedTarget = parseMarkdownImageTarget(rawTarget);
    if (!parsedTarget) {
      return fullMatch;
    }
    if (
      parsedTarget.destination.startsWith(ASSET_MARKDOWN_SCHEME) ||
      isRemoteImageDestination(parsedTarget.destination) ||
      managedDestinations.has(parsedTarget.destination)
    ) {
      return fullMatch;
    }

    degradedTargets.add(parsedTarget.destination);
    return buildVisibleFallbackLabel(altText, parsedTarget.destination);
  });

  return {
    content: rewrittenContent,
    degradedReason:
      degradedTargets.size > 0
        ? `EPUB embedded resources not imported yet: ${Array.from(degradedTargets).join(' | ')}`
        : null
  };
}
