import fs from 'node:fs/promises';
import path from 'node:path';

import { buildRetainedDegradedImportContent } from '../../lib/core/import/controlledContext.js';

import { readEpubArchiveEntries } from './epubArchive.js';
import { buildChapterMarkdown } from './epubChapterMarkdown.js';
import { collectManagedEpubImages } from './epubEmbeddedImages.js';
import { isCoverLikeChapter, isTocLikeChapter } from './epubImportChapterHeuristics.js';
import { buildBookNodes, type RawBookNode } from './epubImportTree.js';
import { readEpubToc } from './epubToc.js';
import { type ImportSourceDescriptor } from './importSourcePipeline.js';

export interface RawEpubBook {
  nodes: RawBookNode[];
  title: string;
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder('utf-8').decode(bytes);
}

function parseAttributes(fragment: string) {
  const attributes: Record<string, string> = {};
  for (const match of fragment.matchAll(/([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return attributes;
}

function readArchiveText(entries: Map<string, Uint8Array>, entryPath: string, message: string) {
  const bytes = entries.get(entryPath);
  if (!bytes) {
    throw new Error(message);
  }
  return decodeText(bytes);
}

function readPackagePath(containerXml: string) {
  const match = containerXml.match(/<rootfile\b([^>]*)\/?>/i);
  const fullPath = match ? parseAttributes(match[1])['full-path'] : null;
  if (!fullPath) {
    throw new Error('EPUB import failed: missing package document path in META-INF/container.xml');
  }
  return fullPath.replace(/\\/g, '/');
}

function parseManifest(opfXml: string, opfDirectory: string) {
  const manifest = new Map<string, { href: string; mediaType: string | null; properties: string[] }>();
  for (const match of opfXml.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const attributes = parseAttributes(match[1]);
    if (!attributes.id || !attributes.href) continue;
    manifest.set(attributes.id, {
      href: path.posix.normalize(path.posix.join(opfDirectory, attributes.href.replace(/\\/g, '/'))),
      mediaType: attributes['media-type'] ?? null,
      properties: (attributes.properties ?? '')
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean)
    });
  }
  return manifest;
}

function parseSpine(opfXml: string) {
  return Array.from(opfXml.matchAll(/<itemref\b([^>]*)\/?>/gi))
    .map((match) => parseAttributes(match[1]))
    .filter((attributes) => attributes.idref && attributes.linear !== 'no')
    .map((attributes) => attributes.idref as string);
}

function parseGuideCoverPaths(opfXml: string, opfDirectory: string) {
  return new Set(
    Array.from(opfXml.matchAll(/<reference\b([^>]*)\/?>/gi))
      .map((match) => parseAttributes(match[1]))
      .filter((attributes) => attributes.type?.toLowerCase() === 'cover' && attributes.href)
      .map((attributes) => path.posix.normalize(path.posix.join(opfDirectory, attributes.href!.replace(/\\/g, '/'))))
  );
}

function readBookTitle(opfXml: string, sourceName: string) {
  const titleMatch = opfXml.match(/<(?:dc:title|title)\b[^>]*>([\s\S]*?)<\/(?:dc:title|title)>/i);
  return titleMatch?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || path.basename(sourceName, '.epub');
}

function buildDegradedChapterNode(input: {
  fallbackTitle: string;
  href: string;
  index: number;
  reason: string;
}) {
  return {
    content: buildRetainedDegradedImportContent({ reason: input.reason, sourceKind: 'epub', sourceName: input.fallbackTitle }),
    degradedReason: input.reason,
    embeddedImages: [],
    href: input.href,
    key: `${input.index}-${input.href}`,
    parentKey: null,
    title: input.fallbackTitle
  };
}

function buildSpineChapterNode(input: {
  entries: ReadonlyMap<string, Uint8Array>;
  fallbackTitle: string;
  guideCoverPaths: ReadonlySet<string>;
  href: string;
  index: number;
  mediaType: string | null;
  properties: string[];
}) {
  if (input.properties.includes('nav')) {
    return null;
  }
  if (input.mediaType && !['application/xhtml+xml', 'text/html'].includes(input.mediaType)) {
    return buildDegradedChapterNode({
      fallbackTitle: input.fallbackTitle,
      href: input.href,
      index: input.index,
      reason: `EPUB chapter unsupported media type: ${input.mediaType}`
    });
  }
  const htmlBytes = input.entries.get(input.href);
  if (!htmlBytes) {
    return buildDegradedChapterNode({
      fallbackTitle: input.fallbackTitle,
      href: input.href,
      index: input.index,
      reason: `EPUB chapter missing entry: ${input.href}`
    });
  }
  const chapter = buildChapterMarkdown(decodeText(htmlBytes), input.fallbackTitle);
  const embeddedImages = collectManagedEpubImages(chapter.content, input.href, input.entries);
  if (isCoverLikeChapter({ content: chapter.content, title: chapter.title }, input.href, input.guideCoverPaths)) {
    return null;
  }
  if (isTocLikeChapter({ content: chapter.content, title: chapter.title })) {
    return null;
  }
  return {
    content: chapter.content,
    degradedReason: chapter.degradedReason,
    embeddedImages,
    href: input.href,
    key: `${input.index}-${input.href}`,
    parentKey: null,
    title: chapter.title
  };
}

function buildSpineChapterNodes(input: {
  entries: ReadonlyMap<string, Uint8Array>;
  guideCoverPaths: ReadonlySet<string>;
  manifest: ReturnType<typeof parseManifest>;
  spine: string[];
}) {
  return input.spine.flatMap((idref, index) => {
    const item = input.manifest.get(idref);
    const fallbackTitle = `Chapter ${index + 1}`;
    if (!item) {
      return [{
        content: buildRetainedDegradedImportContent({
          reason: `EPUB chapter missing manifest entry: ${idref}`,
          sourceKind: 'epub',
          sourceName: fallbackTitle
        }),
        degradedReason: `EPUB chapter missing manifest entry: ${idref}`,
        embeddedImages: [],
        href: `${idref}.xhtml`,
        key: `${index}-${idref}`,
        parentKey: null,
        title: fallbackTitle
      }];
    }
    const chapter = buildSpineChapterNode({
      entries: input.entries,
      fallbackTitle,
      guideCoverPaths: input.guideCoverPaths,
      href: item.href,
      index,
      mediaType: item.mediaType,
      properties: item.properties
    });
    return chapter ? [chapter] : [];
  });
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
  const chapters = buildSpineChapterNodes({ entries, guideCoverPaths, manifest, spine });
  const toc = readEpubToc({ entries, manifest, opfDirectory, opfXml });

  return { nodes: buildBookNodes({ chapters, toc }), title };
}
