export interface InlineImageReference {
  altText: string;
  destination: string;
  fullMatch: string;
  suffix: string;
  syntax: 'markdown' | 'obsidian';
}

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
const OBSIDIAN_IMAGE_PATTERN = /!\[\[([^\]\n]+)\]\]/g;

function parseMarkdownImageTarget(target: string) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return null;
  }
  if (trimmedTarget.startsWith('<')) {
    const closingIndex = trimmedTarget.indexOf('>');
    if (closingIndex > 0) {
      return {
        destination: trimmedTarget.slice(1, closingIndex),
        suffix: trimmedTarget.slice(closingIndex + 1).trim()
      };
    }
  }
  const match = /^(\S+)(?:\s+(.+))?$/.exec(trimmedTarget);
  if (!match) {
    return null;
  }
  return {
    destination: match[1],
    suffix: match[2]?.trim() ?? ''
  };
}

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
  const rewrittenMarkdown = content.replace(MARKDOWN_IMAGE_PATTERN, (fullMatch, altText: string, rawTarget: string) => {
    const parsedTarget = parseMarkdownImageTarget(rawTarget);
    if (!parsedTarget) {
      return fullMatch;
    }
    return replacer({
      altText,
      destination: parsedTarget.destination,
      fullMatch,
      suffix: parsedTarget.suffix,
      syntax: 'markdown'
    });
  });

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
