import fs from 'node:fs/promises';
import path from 'node:path';

import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';
import { buildRetainedDegradedImportContent } from '../../lib/core/import/controlledContext.js';

import { readEpubArchiveEntries } from './epubArchive.js';
import { buildChapterMarkdown } from './epubChapterMarkdown.js';
import { collectManagedEpubImages } from './epubEmbeddedImages.js';
import { isCoverLikeChapter } from './epubImportChapterHeuristics.js';
import { splitEpubChaptersByTocFragments } from './epubImportFragmentSections.js';
import { diagnoseEpubImportHealth } from './epubImportHealth.js';
import {
  buildCoverRootContentFromChapter,
  buildRootCoverFromImage,
  type RootBookContent
} from './epubImportRootContent.js';
import { buildBookNodes, type RawBookNode } from './epubImportTree.js';
import {
  parseGuideCoverPaths,
  parseManifest,
  parseSpine,
  readBookTitle,
  readPackagePath,
  type SpineItem
} from './epubPackageDocument.js';
import { readEpubToc } from './epubToc.js';
import { type ImportSourceDescriptor } from './importSourcePipeline.js';

export interface RawEpubBook {
  nodes: RawBookNode[];
  rootContent: string;
  rootDegradedReason: string | null;
  rootEmbeddedImages: PreparedImportEmbeddedImage[];
  title: string;
}

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

function readArchiveText(entries: Map<string, Uint8Array>, entryPath: string, message: string) {
  const bytes = entries.get(entryPath);
  if (!bytes) {
    throw new Error(message);
  }
  return decodeText(bytes);
}

function appendReason(current: string | null, next: string | null) {
  if (!next) return current;
  return current ? `${current}; ${next}` : next;
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

function buildSpineChapterNodes(input: {
  entries: ReadonlyMap<string, Uint8Array>;
  guideCoverPaths: ReadonlySet<string>;
  manifest: ReturnType<typeof parseManifest>;
  spine: SpineItem[];
}) {
  return input.spine.reduce<{ chapters: SpineChapterNode[]; rootCover: RootBookContent | null }>((result, spineItem, index) => {
    if (!spineItem.linear) {
      return result;
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
      return result;
    }
    const built = buildSpineChapterNode({
      entries: input.entries,
      fallbackTitle,
      guideCoverPaths: input.guideCoverPaths,
      href: item.href,
      index,
      mediaType: item.mediaType
    });
    if (built?.chapter) {
      result.chapters.push(built.chapter);
    }
    if (!result.rootCover && built?.rootCover?.content) {
      result.rootCover = built.rootCover;
    }
    return result;
  }, { chapters: [], rootCover: null });
}

export async function readRawEpubBook(source: ImportSourceDescriptor): Promise<RawEpubBook> {
  const entries = readEpubArchiveEntries(await fs.readFile(source.filePath));
  const mimetype = entries.get('mimetype');
  if (!mimetype || decodeText(mimetype).trim() !== 'application/epub+zip') {
    throw new Error('EPUB import failed: missing or invalid mimetype entry');
  }
  const containerXml = readArchiveText(entries, 'META-INF/container.xml', 'EPUB import failed: missing META-INF/container.xml');
  const packagePath = readPackagePath(containerXml);
  const opfXml = readArchiveText(entries, packagePath, `EPUB import failed: missing package document ${packagePath}`);
  const opfDirectory = path.posix.dirname(packagePath);
  const manifest = parseManifest(opfXml, opfDirectory);
  const guideCoverPaths = parseGuideCoverPaths(opfXml, opfDirectory);
  const spine = parseSpine(opfXml);
  if (spine.length === 0) {
    throw new Error('EPUB import failed: package document does not declare any spine chapters');
  }
  const title = readBookTitle(opfXml, source.sourceName);
  const toc = readEpubToc({ entries, manifest, opfDirectory, opfXml });
  const builtSpine = buildSpineChapterNodes({ entries, guideCoverPaths, manifest, spine });
  const nonLinearHrefs = new Set(
    spine.flatMap((item) => {
      const href = !item.linear ? manifest.get(item.idref)?.href : null;
      return href ? [href] : [];
    })
  );
  const nodes = splitEpubChaptersByTocFragments({ chapters: builtSpine.chapters, entries, nonLinearHrefs, toc });
  const healthReason = diagnoseEpubImportHealth(nodes);
  const rootCover = builtSpine.rootCover ?? buildRootCoverFromImage({ entries, manifest, opfXml });

  return {
    nodes: buildBookNodes({ chapters: nodes, toc }),
    rootContent: rootCover?.content ?? '',
    rootDegradedReason: appendReason(rootCover?.degradedReason ?? null, healthReason),
    rootEmbeddedImages: rootCover?.embeddedImages ?? [],
    title
  };
}
