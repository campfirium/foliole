import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences';
import { parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';

function consumeLabelWhitespaceBefore(markdown: string, index: number) {
  let cursor = index;
  while (cursor > 0 && /\s/u.test(markdown[cursor - 1] ?? '')) cursor -= 1;
  return cursor;
}

function findWrappingLinkEnd(markdown: string, targetStart: number) {
  let depth = 0;
  for (let index = targetStart; index < markdown.length; index += 1) {
    const character = markdown[index];
    if (character === '\n') return -1;
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character !== ')') continue;
    if (depth === 0) return index + 1;
    depth -= 1;
  }
  return -1;
}

export function isRemoteImageLinkTarget(value: string) {
  const parsed = parseMarkdownImageTarget(value);
  if (!parsed) return false;
  try {
    const url = new URL(parsed.destination);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveImageWrappingLink(markdown: string, reference: { end: number; start: number }) {
  const labelStart = consumeLabelWhitespaceBefore(markdown, reference.start);
  if (markdown[labelStart - 1] !== '[') return null;
  const labelEnd = markdown.indexOf('](', reference.end);
  if (labelEnd < 0) return null;
  const linkTargetStart = labelEnd + 2;
  const linkEnd = findWrappingLinkEnd(markdown, linkTargetStart);
  if (linkEnd < 0) return null;
  return {
    caption: markdown.slice(reference.end, labelEnd).trim(),
    from: labelStart - 1,
    target: markdown.slice(linkTargetStart, linkEnd - 1),
    to: linkEnd
  };
}

function replaceImageAlt(reference: { altText: string; fullMatch: string; rawTarget: string }, altText: string) {
  const escapedAlt = altText.replace(/\]/gu, '\\]');
  return `![${escapedAlt || reference.altText}](${reference.rawTarget})`;
}

export function hasLocalizedImageOnlyRemoteWrappingLink(markdown: string) {
  return collectMarkdownImageReferences(markdown).some((reference) => {
    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    if (!parsedTarget || !parseAssetMarkdownUrl(parsedTarget.destination)) return false;
    const wrappingLink = resolveImageWrappingLink(markdown, reference);
    return Boolean(wrappingLink && isRemoteImageLinkTarget(wrappingLink.target));
  });
}

export function removeLocalizedImageOnlyRemoteWrappingLinks(markdown: string) {
  let normalized = '';
  let cursor = 0;
  for (const reference of collectMarkdownImageReferences(markdown)) {
    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    const wrappingLink = parsedTarget && parseAssetMarkdownUrl(parsedTarget.destination)
      ? resolveImageWrappingLink(markdown, reference)
      : null;
    if (!wrappingLink || !isRemoteImageLinkTarget(wrappingLink.target) || wrappingLink.from < cursor) continue;
    normalized += markdown.slice(cursor, wrappingLink.from);
    normalized += wrappingLink.caption ? replaceImageAlt(reference, wrappingLink.caption) : reference.fullMatch;
    cursor = wrappingLink.to;
  }
  return cursor === 0 ? markdown : `${normalized}${markdown.slice(cursor)}`;
}
