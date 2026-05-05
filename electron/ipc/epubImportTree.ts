import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';

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

function stripChapterPrefix(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    return '';
  }
  const strippedChinese = trimmed.replace(/^\s*第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[章节回部卷篇]\s*[:：、.\-)]?\s*/u, '');
  const strippedEnglish = strippedChinese.replace(/^\s*chapter\s+(?:\d+|[ivxlcdm]+)\s*[:：.\-)]?\s*/iu, '');
  return strippedEnglish.trim();
}

function resolveChapterBodyTitle(primaryTitle: string, fallbackTitle: string) {
  const primary = stripChapterPrefix(primaryTitle);
  if (primary) {
    return primary;
  }
  const fallback = stripChapterPrefix(fallbackTitle);
  if (fallback) {
    return fallback;
  }
  return primaryTitle.trim() || fallbackTitle.trim();
}

function stripFragment(href: string | null) {
  return href?.split('#')[0] ?? null;
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
  const chapterForHref = chapterByHref.get(stripFragment(href)) ?? null;
  if (!chapterForHref || consumedChapterKeys.has(chapterForHref.key)) {
    return null;
  }
  return chapterForHref;
}

function appendTocNode(
  nodes: RawBookNode[],
  input: { chapter: SpineChapterNode | null; entry: EpubTocEntry; key: string; parentKey: string | null }
) {
  const { chapter, entry, key, parentKey } = input;
  const splitChapterBody = Boolean(chapter && entry.children.length > 0 && chapter.content.trim());
  const title = entry.title || chapter?.title || `Chapter ${nodes.length + 1}`;
  nodes.push({
    content: splitChapterBody ? `**${title}**` : (chapter?.content ?? ''),
    degradedReason: splitChapterBody ? null : (chapter?.degradedReason ?? null),
    embeddedImages: splitChapterBody ? [] : (chapter?.embeddedImages ?? []),
    key,
    parentKey,
    title
  });
  if (splitChapterBody && chapter) {
    nodes.push({
      content: chapter.content,
      degradedReason: chapter.degradedReason,
      embeddedImages: chapter.embeddedImages,
      key: `${key}::chapter-body`,
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
    return input.chapters.map((chapter) => copyChapterNode(chapter));
  }

  const consumedChapterKeys = new Set<string>();
  const chapterByHref = new Map(input.chapters.map((chapter) => [stripFragment(chapter.href), chapter] as const));
  const nodes: RawBookNode[] = [];
  let tocIndex = 0;

  const visitEntries = (entries: EpubTocEntry[], parentKey: string | null) => {
    entries.forEach((entry) => {
      const matchedChapter = resolveUnconsumedChapter(chapterByHref, consumedChapterKeys, entry.href);
      const key = matchedChapter?.key ?? `toc-${tocIndex += 1}`;
      if (matchedChapter) {
        consumedChapterKeys.add(matchedChapter.key);
      }
      appendTocNode(nodes, { chapter: matchedChapter, entry, key, parentKey });
      visitEntries(entry.children, key);
    });
  };

  visitEntries(input.toc, null);
  for (const chapter of input.chapters) {
    if (!consumedChapterKeys.has(chapter.key)) {
      nodes.push(copyChapterNode(chapter, null));
    }
  }
  return nodes;
}
