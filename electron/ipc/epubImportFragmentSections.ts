import { parse } from 'parse5';

import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';

import { buildChapterMarkdown } from './epubChapterMarkdown.js';
import { collectManagedEpubImages } from './epubEmbeddedImages.js';
import {
  blockContainsFragment,
  collectRenderableBlocks,
  countFragmentMatches,
  findBody,
  normalizeFragment,
  serializeBlocks
} from './epubFragmentDom.js';
import type { RawBookNode } from './epubImportTree.js';
import type { HtmlNode } from './epubParse5.js';
import type { EpubTocEntry } from './epubToc.js';

export interface FragmentSourceChapter extends RawBookNode {
  href: string;
  rawHtml: string;
}

interface FragmentChapter extends FragmentSourceChapter {
  embeddedImages: PreparedImportEmbeddedImage[];
}

function appendReason(current: string | null, next: string | null) {
  if (!next) return current;
  return current ? `${current}; ${next}` : next;
}

function stripFragment(href: string | null) {
  return href?.split('#')[0] ?? null;
}

function fragmentKey(href: string | null) {
  return href?.split('#')[1]?.trim() || null;
}

function entriesForChapter(toc: EpubTocEntry[], chapterHref: string) {
  const entries: EpubTocEntry[] = [];
  const visit = (items: EpubTocEntry[]) => {
    for (const item of items) {
      if (stripFragment(item.href) === chapterHref && fragmentKey(item.href)) {
        entries.push(item);
      }
      visit(item.children);
    }
  };
  visit(toc);
  return entries;
}

function hasBaseEntry(toc: EpubTocEntry[], chapterHref: string) {
  let found = false;
  const visit = (items: EpubTocEntry[]) => {
    for (const item of items) {
      if (item.href === chapterHref) {
        found = true;
        return;
      }
      visit(item.children);
    }
  };
  visit(toc);
  return found;
}

function buildMissingFragmentChapter(chapter: FragmentSourceChapter, entry: EpubTocEntry, reason: string): FragmentChapter {
  return {
    content: '',
    degradedReason: reason,
    embeddedImages: [],
    href: entry.href ?? chapter.href,
    key: `${chapter.key}::${fragmentKey(entry.href) ?? entry.title}`,
    parentKey: chapter.parentKey,
    rawHtml: '',
    title: entry.title || chapter.title
  };
}

function buildFragmentChapter(input: {
  blocks: HtmlNode[];
  chapter: FragmentSourceChapter;
  degradedReason: string | null;
  entries: ReadonlyMap<string, Uint8Array>;
  entry: EpubTocEntry;
  index: number;
}): FragmentChapter {
  const html = serializeBlocks(input.blocks);
  const markdown = buildChapterMarkdown(`<body>${html}</body>`, input.entry.title || input.chapter.title);
  return {
    content: markdown.content,
    degradedReason: appendReason(markdown.degradedReason, input.degradedReason),
    embeddedImages: collectManagedEpubImages(markdown.content, input.chapter.href, input.entries),
    href: input.entry.href ?? input.chapter.href,
    key: `${input.chapter.key}::${fragmentKey(input.entry.href) ?? input.index}`,
    parentKey: input.chapter.parentKey,
    rawHtml: html,
    title: input.entry.title || markdown.title
  };
}

function splitChapterByFragments(
  chapter: FragmentSourceChapter,
  tocEntries: EpubTocEntry[],
  includePreambleInFirstFragment: boolean,
  entries: ReadonlyMap<string, Uint8Array>
) {
  const document = parse(chapter.rawHtml);
  const body = findBody(document);
  const blocks = collectRenderableBlocks(body?.childNodes ?? []);
  const located = tocEntries.map((entry) => {
    const fragment = normalizeFragment(fragmentKey(entry.href) ?? '');
    const matches = fragment ? countFragmentMatches(body?.childNodes ?? [], fragment) : 0;
    const blockIndex = fragment ? blocks.findIndex((block) => blockContainsFragment(block, fragment)) : -1;
    return { blockIndex, entry, fragment, matches };
  });

  const findNextPhysicalBlockIndex = (blockIndex: number) => located.reduce<number | null>((next, candidate) => {
    if (candidate.blockIndex <= blockIndex) return next;
    return next === null ? candidate.blockIndex : Math.min(next, candidate.blockIndex);
  }, null);

  return located.map((item, index) => {
    if (!item.fragment || item.blockIndex < 0) {
      return buildMissingFragmentChapter(chapter, item.entry, `EPUB TOC fragment could not be matched: ${item.entry.href ?? item.fragment}`);
    }
    const nextBlockIndex = findNextPhysicalBlockIndex(item.blockIndex);
    const start = index === 0 && includePreambleInFirstFragment ? 0 : item.blockIndex;
    const end = nextBlockIndex ?? blocks.length;
    const duplicateReason = item.matches > 1 ? `EPUB TOC fragment matched multiple anchors: ${item.entry.href}` : null;
    return buildFragmentChapter({
      blocks: blocks.slice(start, end),
      chapter,
      degradedReason: duplicateReason,
      entries,
      entry: item.entry,
      index
    });
  });
}

export function splitEpubChaptersByTocFragments(input: {
  chapters: FragmentSourceChapter[];
  entries: ReadonlyMap<string, Uint8Array>;
  nonLinearHrefs?: ReadonlySet<string>;
  toc: EpubTocEntry[];
}) {
  const chapters = input.chapters.flatMap((chapter) => {
    const tocEntries = entriesForChapter(input.toc, chapter.href);
    const keepBaseChapter = hasBaseEntry(input.toc, chapter.href);
    if (tocEntries.length <= 1) return [chapter];
    const fragments = splitChapterByFragments(chapter, tocEntries, !keepBaseChapter, input.entries);
    return keepBaseChapter ? [chapter, ...fragments] : fragments;
  });
  const chapterHrefs = new Set(input.chapters.map((chapter) => chapter.href));
  const nonLinearChapters = Array.from(input.nonLinearHrefs ?? []).flatMap((href) => {
    if (chapterHrefs.has(href)) return [];
    return entriesForChapter(input.toc, href).map((entry) => ({
      content: '',
      degradedReason: `EPUB TOC target is non-linear spine item: ${entry.href ?? href}`,
      embeddedImages: [],
      href: entry.href ?? href,
      key: `non-linear::${entry.href ?? href}`,
      parentKey: null,
      rawHtml: '',
      title: entry.title
    }) satisfies FragmentChapter);
  });
  return [...chapters, ...nonLinearChapters];
}
