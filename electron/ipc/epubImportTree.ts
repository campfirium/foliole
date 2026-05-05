import { type EpubTocEntry } from './epubToc.js';

export interface RawBookNode {
  content: string;
  degradedReason: string | null;
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

export function buildBookNodes(input: {
  chapters: SpineChapterNode[];
  toc: EpubTocEntry[];
}) {
  if (input.toc.length === 0) {
    return input.chapters.map(({ content, degradedReason, key, parentKey, title }) => ({
      content,
      degradedReason,
      key,
      parentKey,
      title
    }));
  }

  const consumedChapterKeys = new Set<string>();
  const chapterByHref = new Map(input.chapters.map((chapter) => [stripFragment(chapter.href), chapter] as const));
  const nodes: RawBookNode[] = [];
  let tocIndex = 0;

  const visitEntries = (entries: EpubTocEntry[], parentKey: string | null) => {
    entries.forEach((entry) => {
      const matchedChapter = chapterByHref.get(stripFragment(entry.href)) ?? null;
      const key = matchedChapter?.key ?? `toc-${tocIndex += 1}`;
      if (matchedChapter) {
        consumedChapterKeys.add(matchedChapter.key);
      }
      nodes.push({
        content: matchedChapter?.content ?? '',
        degradedReason: matchedChapter?.degradedReason ?? null,
        key,
        parentKey,
        title: entry.title || matchedChapter?.title || `Chapter ${nodes.length + 1}`
      });
      visitEntries(entry.children, key);
    });
  };

  visitEntries(input.toc, null);
  for (const chapter of input.chapters) {
    if (!consumedChapterKeys.has(chapter.key)) {
      nodes.push({
        content: chapter.content,
        degradedReason: chapter.degradedReason,
        key: chapter.key,
        parentKey: null,
        title: chapter.title
      });
    }
  }
  return nodes;
}
