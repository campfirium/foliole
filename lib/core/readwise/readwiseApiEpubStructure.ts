import { createHash } from 'node:crypto';

import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import {
  convertHtmlToMarkdownCompatible,
  formatHtmlConversionDegradedReason
} from '../import/htmlToMarkdownCompatible.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

interface LocatedMarker {
  attributeValue: string;
  headingLevel: number | null;
  path: string;
  startOffset: number;
  textOffset: number;
  title: string | null;
}

export interface PreparedReadwiseApiEpubSection {
  content: string;
  headingLevel: number | null;
  markerKey: string;
  title: string;
}

export interface PreparedReadwiseApiEpubStructure {
  degradedReason: string | null;
  imageCount: number;
  markerCount: number;
  rootBody: string;
  sections: PreparedReadwiseApiEpubSection[];
}

export function prepareReadwiseApiEpubStructure(html: string): PreparedReadwiseApiEpubStructure {
  const collected = collectDocumentFacts(html);
  const markers = deduplicateMarkers(collected.markers);
  if (markers.length === 0) return missingMarkers(collected.imageCount);
  const tokenPrefix = `FOLIOLERWEPUBTOC${sha256(html).slice(0, 12)}MARK`;
  const injected = injectMarkerTokens(html, markers, tokenPrefix);
  const converted = convertHtmlToMarkdownCompatible(injected);
  const parts = splitAtTokens(converted.content, markers.length, tokenPrefix);
  if (!parts) return missingMarkers(collected.imageCount);
  const sections = markers.flatMap((marker, index): PreparedReadwiseApiEpubSection[] => {
    const content = parts[index + 1]?.trim() ?? '';
    if (!content) return [];
    return [{
      content,
      headingLevel: marker.headingLevel,
      markerKey: sha256(`${marker.attributeValue}\u001f${marker.path}`).slice(0, 24),
      title: marker.title ?? readableMarkdownTitle(content) ?? `Untitled section ${index + 1}`
    }];
  });
  if (sections.length === 0) return missingMarkers(collected.imageCount);
  return {
    degradedReason: formatHtmlConversionDegradedReason(converted.warnings),
    imageCount: collected.imageCount,
    markerCount: markers.length,
    rootBody: parts[0]?.trim() ?? '',
    sections
  };
}

function collectDocumentFacts(html: string) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const markers: LocatedMarker[] = [];
  let imageCount = 0;
  let textOffset = 0;
  const visit = (node: HtmlNode, path: string) => {
    if (node.nodeName === '#text') {
      textOffset += 'value' in node ? node.value.length : 0;
      return;
    }
    if (!('childNodes' in node)) return;
    if ('tagName' in node) {
      if (node.tagName === 'img') imageCount += 1;
      const attribute = node.attrs.find((item) => item.name === 'data-rw-epub-toc');
      const location = node.sourceCodeLocation as { startTag?: { startOffset?: number } } | undefined;
      const startOffset = location?.startTag?.startOffset;
      if (attribute && typeof startOffset === 'number') {
        markers.push({
          attributeValue: attribute.value.trim(),
          headingLevel: /^h[1-6]$/u.test(node.tagName) ? Number(node.tagName.slice(1)) : null,
          path,
          startOffset,
          textOffset,
          title: readableElementTitle(node)
        });
      }
    }
    node.childNodes.forEach((child, index) => visit(child, `${path}.${index}`));
  };
  visit(document, '0');
  return { imageCount, markers };
}

function deduplicateMarkers(markers: LocatedMarker[]) {
  const byPosition = new Map<number, LocatedMarker>();
  for (const marker of markers) {
    const existing = byPosition.get(marker.textOffset);
    if (!existing || markerScore(marker) > markerScore(existing)) byPosition.set(marker.textOffset, marker);
  }
  return [...byPosition.values()].sort((left, right) => left.startOffset - right.startOffset);
}

function markerScore(marker: LocatedMarker) {
  return (marker.title ? 2 : 0) + (marker.headingLevel ? 1 : 0);
}

function injectMarkerTokens(html: string, markers: LocatedMarker[], prefix: string) {
  let output = html;
  [...markers].reverse().forEach((marker, indexFromEnd) => {
    const index = markers.length - indexFromEnd - 1;
    const token = `<p>${prefix}${index}</p>`;
    output = `${output.slice(0, marker.startOffset)}${token}${output.slice(marker.startOffset)}`;
  });
  return output;
}

function splitAtTokens(content: string, count: number, prefix: string) {
  const parts: string[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const token = `${prefix}${index}`;
    const offset = content.indexOf(token, cursor);
    if (offset < 0) return null;
    parts.push(content.slice(cursor, offset));
    cursor = offset + token.length;
  }
  parts.push(content.slice(cursor));
  return parts;
}

function readableElementTitle(element: HtmlElement) {
  const title = collectText(element).replace(/\s+/gu, ' ').trim();
  return title ? title.slice(0, 120) : null;
}

function collectText(node: HtmlNode): string {
  if (node.nodeName === '#text') return 'value' in node ? node.value : '';
  return 'childNodes' in node ? node.childNodes.map(collectText).join(' ') : '';
}

function readableMarkdownTitle(content: string) {
  const line = content.split('\n').map((item) => item.trim()).find(Boolean);
  return line?.replace(/^#{1,6}\s+/u, '').replace(/[*_`~]/gu, '').trim().slice(0, 120) || null;
}

function missingMarkers(imageCount = 0): PreparedReadwiseApiEpubStructure {
  return {
    degradedReason: 'Reader EPUB table of contents markers were unavailable; imported as a single Topic.',
    imageCount,
    markerCount: 0,
    rootBody: '',
    sections: []
  };
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
