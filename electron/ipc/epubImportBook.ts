import fs from 'node:fs/promises';
import path from 'node:path';

import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import { buildRetainedDegradedImportContent } from '../../lib/core/import/controlledContext.js';
import {
  convertHtmlToMarkdownCompatible,
  formatHtmlConversionDegradedReason
} from '../../lib/core/import/htmlToMarkdownCompatible.js';

import { readEpubArchiveEntries } from './epubArchive.js';
import { type ImportSourceDescriptor } from './importSourcePipeline.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

export interface RawChapter {
  content: string;
  degradedReason: string | null;
  key: string;
}

export interface RawEpubBook {
  chapters: RawChapter[];
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
  const manifest = new Map<string, { href: string; mediaType: string | null }>();
  for (const match of opfXml.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const attributes = parseAttributes(match[1]);
    if (!attributes.id || !attributes.href) continue;
    manifest.set(attributes.id, {
      href: path.posix.normalize(path.posix.join(opfDirectory, attributes.href.replace(/\\/g, '/'))),
      mediaType: attributes['media-type'] ?? null
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

function buildChapterMarkdown(html: string, fallbackTitle: string) {
  const document = parse(html);
  const pageTitle = findFirstText(document, 'title');
  const firstHeading = findFirstText(document, 'h1');
  const title = pageTitle ?? firstHeading ?? fallbackTitle;
  const converted = convertHtmlToMarkdownCompatible(html);
  const body = converted.content.trim();
  const needsTitleHeading = Boolean(pageTitle) || (Boolean(firstHeading) && !body.startsWith('# '));
  return {
    content: needsTitleHeading && body ? `# ${title}\n\n${body}` : body || `# ${title}`,
    degradedReason: formatHtmlConversionDegradedReason(converted.warnings)
  };
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
  const manifest = parseManifest(opfXml, path.posix.dirname(packagePath));
  const spine = parseSpine(opfXml);
  if (spine.length === 0) {
    throw new Error('EPUB import failed: package document does not declare any spine chapters');
  }

  const titleMatch = opfXml.match(/<(?:dc:title|title)\b[^>]*>([\s\S]*?)<\/(?:dc:title|title)>/i);
  const title = titleMatch?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || path.basename(source.sourceName, '.epub');
  const chapters = spine.map((idref, index) => {
    const item = manifest.get(idref);
    const fallbackTitle = `Chapter ${index + 1}`;
    if (!item) {
      return {
        content: buildRetainedDegradedImportContent({ reason: `EPUB chapter missing manifest entry: ${idref}`, sourceKind: 'epub', sourceName: fallbackTitle }),
        degradedReason: `EPUB chapter missing manifest entry: ${idref}`,
        key: `${index}-${idref}`
      } satisfies RawChapter;
    }
    if (item.mediaType && !['application/xhtml+xml', 'text/html'].includes(item.mediaType)) {
      return {
        content: buildRetainedDegradedImportContent({ reason: `EPUB chapter unsupported media type: ${item.mediaType}`, sourceKind: 'epub', sourceName: fallbackTitle }),
        degradedReason: `EPUB chapter unsupported media type: ${item.mediaType}`,
        key: `${index}-${item.href}`
      } satisfies RawChapter;
    }
    const htmlBytes = entries.get(item.href);
    if (!htmlBytes) {
      return {
        content: buildRetainedDegradedImportContent({ reason: `EPUB chapter missing entry: ${item.href}`, sourceKind: 'epub', sourceName: fallbackTitle }),
        degradedReason: `EPUB chapter missing entry: ${item.href}`,
        key: `${index}-${item.href}`
      } satisfies RawChapter;
    }
    const chapter = buildChapterMarkdown(decodeText(htmlBytes), fallbackTitle);
    return { content: chapter.content, degradedReason: chapter.degradedReason, key: `${index}-${item.href}` } satisfies RawChapter;
  });

  return { chapters, title };
}
