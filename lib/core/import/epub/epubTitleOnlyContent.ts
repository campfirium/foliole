import { collectMarkdownImageReferences } from '../markdownImageReferences.js';

export function normalizeSectionTitle(title: string) {
  return title
    .replace(/\[\^?\d+\]/g, '')
    .replace(/[*_`~[\]()#]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

/** A body that only repeats the node's own title has nothing to read, so it is stored empty. */
export function isTitleOnlyContent(content: string, titles: readonly string[]) {
  const known = new Set(titles.map(normalizeSectionTitle));
  return content.split('\n').every((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    const text = /^#{1,6}\s+(.*)$/.exec(trimmed)?.[1] ?? /^\*\*(.*)\*\*$/.exec(trimmed)?.[1];
    return text !== undefined && collectMarkdownImageReferences(text).length === 0 && known.has(normalizeSectionTitle(text));
  });
}
