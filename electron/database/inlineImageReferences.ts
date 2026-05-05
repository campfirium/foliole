import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';

export interface InlineImageReference {
  altText: string;
  destination: string;
  fullMatch: string;
  suffix: string;
  syntax: 'markdown' | 'obsidian';
}

const OBSIDIAN_IMAGE_PATTERN = /!\[\[([^\]\n]+)\]\]/g;

function resolveDefaultAltText(destination: string) {
  const fileName = destination.split(/[\\/]/).pop() ?? destination;
  return fileName.replace(/\.[^.]+$/, '');
}

function parseObsidianImageTarget(target: string) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return null;
  }
  const separatorIndex = trimmedTarget.indexOf('|');
  const destination = (separatorIndex >= 0 ? trimmedTarget.slice(0, separatorIndex) : trimmedTarget).trim();
  if (!destination) {
    return null;
  }
  const alias = (separatorIndex >= 0 ? trimmedTarget.slice(separatorIndex + 1) : '').trim();
  return {
    altText: alias || resolveDefaultAltText(destination),
    destination,
    suffix: ''
  };
}

export function rewriteInlineImageReferences(
  content: string,
  replacer: (reference: InlineImageReference) => string
) {
  const markdownMatches = collectMarkdownImageReferences(content);
  let rewrittenMarkdown = '';
  let previousEnd = 0;

  for (const match of markdownMatches) {
    rewrittenMarkdown += content.slice(previousEnd, match.start);
    const parsedTarget = parseMarkdownImageTarget(match.rawTarget);
    rewrittenMarkdown += parsedTarget
      ? replacer({
          altText: match.altText,
          destination: parsedTarget.destination,
          fullMatch: match.fullMatch,
          suffix: parsedTarget.suffix,
          syntax: 'markdown'
        })
      : match.fullMatch;
    previousEnd = match.end;
  }

  rewrittenMarkdown += content.slice(previousEnd);

  return rewrittenMarkdown.replace(OBSIDIAN_IMAGE_PATTERN, (fullMatch, rawTarget: string) => {
    const parsedTarget = parseObsidianImageTarget(rawTarget);
    if (!parsedTarget) {
      return fullMatch;
    }
    return replacer({
      altText: parsedTarget.altText,
      destination: parsedTarget.destination,
      fullMatch,
      suffix: parsedTarget.suffix,
      syntax: 'obsidian'
    });
  });
}
