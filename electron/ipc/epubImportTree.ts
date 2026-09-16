import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';

import { resolveChapterBodyTitle } from './epubImportTreeTitles.js';
import { type EpubTocEntry } from './epubToc.js';

export interface RawBookNode {
  content: string;
  degradedReason: string | null;
  embeddedImages: PreparedImportEmbeddedImage[];
  key: string;
  parentKey: string | null;
  title: string;
}

interface SpineChapterNode extends RawBookNode {
  href: string;
}

function stripFragment(href: string | null) {
  return href?.split('#')[0] ?? null;
}

function hasFragment(href: string | null) {
  return Boolean(href?.includes('#'));
}

function fragmentKey(href: string | null) {
  return href?.split('#')[1]?.trim() || null;
}

function normalizeSectionTitle(title: string) {
  return title
    .replace(/\[\^?\d+\]/g, '')
    .replace(/[*_`~[\]()#]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function findSectionHeading(lines: string[], title: string) {
  const normalizedTitle = normalizeSectionTitle(title);
  if (!normalizedTitle) {
    return null;
  }
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^(#{1,6})\s+(.+)$/);
    if (match && normalizeSectionTitle(match[2] ?? '') === normalizedTitle) {
      return { index, level: match[1]?.length ?? 1 };
    }
  }
  return null;
}

function sliceMarkdownSection(content: string, title: string) {
  const lines = content.split('\n');
  const heading = findSectionHeading(lines, title);
  if (!heading) {
    return null;
  }
  let end = lines.length;
  for (let index = heading.index + 1; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^(#{1,6})\s+/);
    if (match && (match[1]?.length ?? 1) <= heading.level) {
      end = index;
      break;
    }
  }
  return lines.slice(heading.index, end).join('\n').trim();
}

function copyChapterNode(chapter: RawBookNode, parentKey: string | null = chapter.parentKey) {
  return {
    content: chapter.content,
    degradedReason: chapter.degradedReason,
    embeddedImages: chapter.embeddedImages,
    key: chapter.key,
    parentKey,
    title: chapter.title
  } satisfies RawBookNode;
}

function resolveUnconsumedChapter(
  chapterByHref: Map<string | null, SpineChapterNode>,
  consumedChapterKeys: Set<string>,
  href: string | null
) {
  const chapterForHref = chapterByHref.get(href) ?? chapterByHref.get(stripFragment(href)) ?? null;
  if (hasFragment(href)) {
    return chapterForHref;
  }
  if (!chapterForHref || consumedChapterKeys.has(chapterForHref.key)) {
    return null;
  }
  return chapterForHref;
}

function appendTocNode(
  nodes: RawBookNode[],
  input: {
    chapter: SpineChapterNode | null;
    entry: EpubTocEntry;
    key: string;
    parentKey: string | null;
    sliceByTitle: boolean;
    usedKeys: Set<string>;
  }
) {
  const { chapter, entry, key, parentKey } = input;
  const fragment = fragmentKey(entry.href);
  const content = chapter && input.sliceByTitle
    ? (sliceMarkdownSection(chapter.content, entry.title)
      ?? (normalizeSectionTitle(chapter.title) === normalizeSectionTitle(entry.title) ? chapter.content : ''))
    : (chapter?.content ?? '');
  const splitChapterBody = Boolean(chapter && entry.children.length > 0 && content.trim());
  const placeholderParent = Boolean(entry.children.length > 0 && !content.trim());
  const missingFragmentReason = chapter && fragment && !hasFragment(chapter.href) && !content
    ? `EPUB TOC fragment could not be matched: ${entry.href ?? fragment}`
    : null;
  const title = entry.title || chapter?.title || `Chapter ${nodes.length + 1}`;
  nodes.push({
    content: splitChapterBody || placeholderParent ? `**${title}**` : content,
    degradedReason: splitChapterBody ? null : (missingFragmentReason ?? chapter?.degradedReason ?? null),
    embeddedImages: splitChapterBody ? [] : (chapter?.embeddedImages ?? []),
    key,
    parentKey,
    title
  });
  if (splitChapterBody && chapter) {
    nodes.push({
      content,
      degradedReason: chapter.degradedReason,
      embeddedImages: chapter.embeddedImages,
      key: allocateUniqueKey(`${key}::chapter-body`, input.usedKeys),
      parentKey: key,
      title: resolveChapterBodyTitle(entry.title, chapter.title)
    });
  }
}

export function buildBookNodes(input: {
  chapters: SpineChapterNode[];
  toc: EpubTocEntry[];
}) {
  if (input.toc.length === 0) {
    const usedKeys = new Set<string>();
    return input.chapters.map((chapter) => copyChapterNode(
      { ...chapter, key: allocateUniqueKey(chapter.key, usedKeys) }
    ));
  }

  const consumedChapterKeys = new Set<string>();
  const chapterByHref = new Map<string | null, SpineChapterNode>();
  for (const chapter of input.chapters) {
    chapterByHref.set(chapter.href, chapter);
    const baseHref = stripFragment(chapter.href);
    if (!hasFragment(chapter.href) && !chapterByHref.has(baseHref)) {
      chapterByHref.set(baseHref, chapter);
    }
  }
  const nodes: RawBookNode[] = [];
  const referenceCounts = countUnanchoredTocReferences(input.toc);
  const usedKeys = new Set<string>();
  let tocIndex = 0;

  const visitEntries = (entries: EpubTocEntry[], parentKey: string | null) => {
    entries.forEach((entry) => {
      const repeatedReference = (referenceCounts.get(entry.href) ?? 0) > 1;
      const matchedChapter = repeatedReference
        ? (chapterByHref.get(entry.href) ?? chapterByHref.get(stripFragment(entry.href)) ?? null)
        : resolveUnconsumedChapter(chapterByHref, consumedChapterKeys, entry.href);
      const fragment = matchedChapter && hasFragment(entry.href) ? fragmentKey(entry.href) : null;
      const sliceByTitle = Boolean(matchedChapter && !hasFragment(matchedChapter.href) && (fragment || repeatedReference));
      const hasSection = Boolean(matchedChapter && sliceByTitle && sliceMarkdownSection(matchedChapter.content, entry.title));
      const preferredKey = matchedChapter && !repeatedReference && (!sliceByTitle || hasSection)
        ? (fragment ? `${matchedChapter.key}::${fragment}` : matchedChapter.key)
        : `toc-${tocIndex += 1}`;
      const key = allocateUniqueKey(preferredKey, usedKeys);
      if (matchedChapter) {
        consumedChapterKeys.add(matchedChapter.key);
      }
      appendTocNode(nodes, { chapter: matchedChapter, entry, key, parentKey, sliceByTitle, usedKeys });
      visitEntries(entry.children, key);
    });
  };

  visitEntries(input.toc, null);
  reconcileUnconsumedChapterBodies(nodes, input.chapters, consumedChapterKeys);
  return nodes;
}

function allocateUniqueKey(preferred: string, used: Set<string>) {
  let key = preferred;
  let suffix = 2;
  while (used.has(key)) {
    key = `${preferred}::${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

function countUnanchoredTocReferences(toc: EpubTocEntry[]) {
  const counts = new Map<string | null, number>();
  const visit = (entries: EpubTocEntry[]) => entries.forEach((entry) => {
    if (entry.href && !hasFragment(entry.href)) {
      counts.set(entry.href, (counts.get(entry.href) ?? 0) + 1);
    }
    visit(entry.children);
  });
  visit(toc);
  return counts;
}

function reconcileUnconsumedChapterBodies(
  nodes: RawBookNode[],
  chapters: SpineChapterNode[],
  consumedChapterKeys: ReadonlySet<string>
) {
  const nodesByTitle = new Map<string, RawBookNode[]>();
  for (const node of nodes) {
    const title = normalizeSectionTitle(node.title);
    nodesByTitle.set(title, [...(nodesByTitle.get(title) ?? []), node]);
  }
  for (const chapter of chapters) {
    const matches = nodesByTitle.get(normalizeSectionTitle(chapter.title)) ?? [];
    if (matches.length !== 1) continue;
    const [node] = matches;
    if (!node || (consumedChapterKeys.has(chapter.key) && node.content.trim())) continue;
    node.content = chapter.content;
    node.degradedReason = chapter.degradedReason;
    node.embeddedImages = chapter.embeddedImages;
  }
}
