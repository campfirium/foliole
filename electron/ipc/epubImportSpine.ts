import { buildRetainedDegradedImportContent } from '../../lib/core/import/controlledContext.js';

import { EpubArchiveEntries } from './epubArchiveEntries.js';
import { buildChapterMarkdown } from './epubChapterMarkdown.js';
import { collectManagedEpubImages } from './epubEmbeddedImages.js';
import { isCoverLikeChapter } from './epubImportChapterHeuristics.js';
import { buildCoverRootContentFromChapter, type RootBookContent } from './epubImportRootContent.js';
import type { RawBookNode } from './epubImportTree.js';
import { parseManifest, type SpineItem } from './epubPackageDocument.js';
import { stageEpubText } from './epubStagedContent.js';

interface SpineChapterNode extends RawBookNode {
  href: string;
  rawHtml: string;
}

interface SpineChapterBuildResult {
  chapter: SpineChapterNode | null;
  rootCover: RootBookContent | null;
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder('utf-8').decode(bytes);
}

function buildDegradedChapterNode(input: {
  fallbackTitle: string;
  href: string;
  index: number;
  reason: string;
}): SpineChapterNode {
  return {
    content: buildRetainedDegradedImportContent({ reason: input.reason, sourceKind: 'epub', sourceName: input.fallbackTitle }),
    degradedReason: input.reason,
    embeddedImages: [],
    href: input.href,
    key: `${input.index}-${input.href}`,
    parentKey: null,
    rawHtml: '',
    title: input.fallbackTitle
  };
}

function buildDegradedSpineChapterResult(input: {
  fallbackTitle: string;
  href: string;
  index: number;
  reason: string;
}): SpineChapterBuildResult {
  return {
    chapter: buildDegradedChapterNode(input),
    rootCover: null
  };
}

function buildSpineChapterNode(input: {
  entries: ReadonlyMap<string, Uint8Array>;
  fallbackTitle: string;
  guideCoverPaths: ReadonlySet<string>;
  href: string;
  index: number;
  mediaType: string | null;
}): SpineChapterBuildResult {
  if (input.mediaType && !['application/xhtml+xml', 'text/html'].includes(input.mediaType)) {
    return buildDegradedSpineChapterResult({
      fallbackTitle: input.fallbackTitle,
      href: input.href,
      index: input.index,
      reason: `EPUB chapter unsupported media type: ${input.mediaType}`
    });
  }
  const htmlBytes = input.entries.get(input.href);
  if (!htmlBytes) {
    return buildDegradedSpineChapterResult({
      fallbackTitle: input.fallbackTitle,
      href: input.href,
      index: input.index,
      reason: `EPUB chapter missing entry: ${input.href}`
    });
  }
  const chapter = buildChapterMarkdown(decodeText(htmlBytes), input.fallbackTitle);
  const embeddedImages = collectManagedEpubImages(chapter.content, input.href, input.entries);
  if (isCoverLikeChapter({ content: chapter.content, title: chapter.title }, input.href, input.guideCoverPaths)) {
    return {
      chapter: null,
      rootCover: buildCoverRootContentFromChapter({ content: chapter.content, degradedReason: chapter.degradedReason, embeddedImages })
    };
  }
  return {
    chapter: {
      content: chapter.content,
      degradedReason: chapter.degradedReason,
      embeddedImages,
      href: input.href,
      key: `${input.index}-${input.href}`,
      parentKey: null,
      rawHtml: decodeText(htmlBytes),
      title: chapter.title
    },
    rootCover: null
  };
}

export async function buildSpineChapterNodes(input: {
  workingDirectory: string;
  entries: EpubArchiveEntries;
  guideCoverPaths: ReadonlySet<string>;
  manifest: ReturnType<typeof parseManifest>;
  spine: SpineItem[];
}) {
  const result: { chapters: SpineChapterNode[]; rootCover: RootBookContent | null } = { chapters: [], rootCover: null };
  for (const [index, spineItem] of input.spine.entries()) {
    if (!spineItem.linear) {
      continue;
    }
    const item = input.manifest.get(spineItem.idref);
    const fallbackTitle = `Chapter ${index + 1}`;
    if (!item) {
      result.chapters.push({
        content: buildRetainedDegradedImportContent({
          reason: `EPUB chapter missing manifest entry: ${spineItem.idref}`,
          sourceKind: 'epub',
          sourceName: fallbackTitle
        }),
        degradedReason: `EPUB chapter missing manifest entry: ${spineItem.idref}`,
        embeddedImages: [],
        href: `${spineItem.idref}.xhtml`,
        key: `${index}-${spineItem.idref}`,
        parentKey: null,
        rawHtml: '',
        title: fallbackTitle
      });
      continue;
    }
    await input.entries.extract(item.href);
    const built = buildSpineChapterNode({
      entries: input.entries,
      fallbackTitle,
      guideCoverPaths: input.guideCoverPaths,
      href: item.href,
      index,
      mediaType: item.mediaType
    });
    if (built?.chapter) {
      result.chapters.push(stageEpubText(built.chapter, ['content', 'rawHtml'], input.workingDirectory));
    }
    if (!result.rootCover && built?.rootCover?.content) {
      result.rootCover = built.rootCover;
    }
  }
  return result;
}
