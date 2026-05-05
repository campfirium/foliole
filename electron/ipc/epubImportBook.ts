import fs from 'node:fs/promises';
import path from 'node:path';

import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import { buildRetainedDegradedImportContent } from '../../lib/core/import/controlledContext.js';
import {
  convertHtmlToMarkdownCompatible,
  formatHtmlConversionDegradedReason
} from '../../lib/core/import/htmlToMarkdownCompatible.js';
import { extractUniqueLevelOneHeading } from '../../lib/core/import/importedNodeTitle.js';

import { readEpubArchiveEntries } from './epubArchive.js';
import {
  extractFirstMeaningfulBodyLine,
  extractFirstMarkdownHeadingText,
  increaseMarkdownHeadingLevels,
  isCoverLikeChapter,
  isTocLikeChapter,
  normalizePageTitle
} from './epubImportChapterHeuristics.js';
import { buildBookNodes, type RawBookNode } from './epubImportTree.js';
import { readEpubToc } from './epubToc.js';
import { type ImportSourceDescriptor } from './importSourcePipeline.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

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

function collectText(node: HtmlNode): string {
  if (node.nodeName === '#text') {
    return ('value' in node ? node.value : '').replace(/\s+/g, ' ').trim();
  }
  if (!('childNodes' in node)) {
    return '';
  }
  return node.childNodes.map((child) => collectText(child)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function findFirstText(node: HtmlNode, tagName: string): string | null {
  if ('tagName' in node && (node as HtmlElement).tagName === tagName) {
    return collectText(node) || null;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const match = findFirstText(child, tagName);
    if (match) return match;
  }
  return null;
}

function findFirstHeadingText(node: HtmlNode): string | null {
  if ('tagName' in node && /^h[1-6]$/.test((node as HtmlElement).tagName)) {
    const element = node as HtmlElement;
    if (element.attrs.some((attribute) => attribute.name === 'hidden' && attribute.value !== 'false')) {
      return null;
    }
    return collectText(node) || null;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const match = findFirstHeadingText(child);
    if (match) return match;
  }
  return null;
}

function buildChapterMarkdown(html: string, fallbackTitle: string) {
  const document = parse(html);
  const pageTitle = normalizePageTitle(findFirstText(document, 'title'));
  const firstHeading = findFirstHeadingText(document);
  const converted = convertHtmlToMarkdownCompatible(html);
  const body = converted.content.trim();
  const bodyTitle = extractFirstMarkdownHeadingText(body) ?? extractUniqueLevelOneHeading(body) ?? extractFirstMeaningfulBodyLine(body);
  const resolvedTitle = pageTitle ?? firstHeading ?? bodyTitle ?? fallbackTitle;
  const needsTitleHeading =
    Boolean(body) &&
    (!bodyTitle || bodyTitle !== resolvedTitle) &&
    (Boolean(pageTitle) || Boolean(firstHeading) || resolvedTitle !== fallbackTitle);
  return {
    content: needsTitleHeading && body ? `# ${resolvedTitle}\n\n${increaseMarkdownHeadingLevels(body)}` : body || `# ${resolvedTitle}`,
    degradedReason: formatHtmlConversionDegradedReason(converted.warnings),
    title: resolvedTitle
  };
}

function readBookTitle(opfXml: string, sourceName: string) {
  const titleMatch = opfXml.match(/<(?:dc:title|title)\b[^>]*>([\s\S]*?)<\/(?:dc:title|title)>/i);
  return titleMatch?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || path.basename(sourceName, '.epub');
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
    return {
      content: buildRetainedDegradedImportContent({
        reason: `EPUB chapter unsupported media type: ${input.mediaType}`,
        sourceKind: 'epub',
        sourceName: input.fallbackTitle
      }),
      degradedReason: `EPUB chapter unsupported media type: ${input.mediaType}`,
      href: input.href,
      key: `${input.index}-${input.href}`,
      parentKey: null,
      title: input.fallbackTitle
    };
  }
  const htmlBytes = input.entries.get(input.href);
  if (!htmlBytes) {
    return {
      content: buildRetainedDegradedImportContent({
        reason: `EPUB chapter missing entry: ${input.href}`,
        sourceKind: 'epub',
        sourceName: input.fallbackTitle
      }),
      degradedReason: `EPUB chapter missing entry: ${input.href}`,
      href: input.href,
      key: `${input.index}-${input.href}`,
      parentKey: null,
      title: input.fallbackTitle
    };
  }
  const chapter = buildChapterMarkdown(decodeText(htmlBytes), input.fallbackTitle);
  if (isCoverLikeChapter({ content: chapter.content, title: chapter.title }, input.href, input.guideCoverPaths)) {
    return null;
  }
  if (isTocLikeChapter({ content: chapter.content, title: chapter.title })) {
    return null;
  }
  return {
    content: chapter.content,
    degradedReason: chapter.degradedReason,
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
