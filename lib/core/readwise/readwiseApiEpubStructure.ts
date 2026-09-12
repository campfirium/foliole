import { createHash } from 'node:crypto';

import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import {
  convertHtmlToMarkdownCompatible,
  formatHtmlConversionDegradedReason
} from '../import/htmlToMarkdownCompatible.js';

import {
  projectReadwiseApiEpubMarkers,
  type ReadwiseApiEpubCandidateAudit
} from './readwiseApiEpubStructureProjection.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

interface LocatedMarker {
  attributeValue: string;
  blockLevel: boolean;
  classSignature: string;
  depth: number;
  headingLevel: number | null;
  insideNavigation: boolean;
  path: string;
  startOffset: number;
  tagName: string;
  textOffset: number;
  title: string | null;
}

export interface PreparedReadwiseApiEpubSection {
  content: string;
  headingLevel: number | null;
  markerKey: string;
  naturalLevel?: number;
  title: string;
}

export interface PreparedReadwiseApiEpubStructure {
  candidates?: ReadwiseApiEpubCandidateAudit[];
  degradedReason: string | null;
  imageCount: number;
  legacyRootBody?: string;
  legacySections?: Array<{ content: string; markerKey: string }>;
  legacyMarkerKeys?: string[];
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
  const markerInputs = markers.map((marker, index) => ({
    blockLevel: marker.blockLevel,
    classSignature: marker.classSignature,
    content: parts[index + 1]?.trim() ?? '',
    depth: marker.depth,
    headingLevel: marker.headingLevel,
    insideNavigation: marker.insideNavigation,
    markerKey: markerKey(marker),
    tagName: marker.tagName,
    title: marker.title
  }));
  const projected = projectReadwiseApiEpubMarkers({ markers: markerInputs, rootBody: parts[0] ?? '' });
  const sections = projected.sections;
  if (sections.length === 0) return missingMarkers(collected.imageCount);
  return {
    candidates: projected.candidates,
    degradedReason: formatHtmlConversionDegradedReason(converted.warnings),
    imageCount: collected.imageCount,
    legacyRootBody: parts[0]?.trim() ?? '',
    legacySections: markerInputs.filter((marker) => marker.content)
      .map((marker) => ({ content: marker.content, markerKey: marker.markerKey })),
    legacyMarkerKeys: markerInputs.filter((marker) => marker.content).map((marker) => marker.markerKey),
    markerCount: markers.length,
    rootBody: projected.rootBody,
    sections
  };
}

function collectDocumentFacts(html: string) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const markers: LocatedMarker[] = [];
  let imageCount = 0;
  let textOffset = 0;
  const visit = (node: HtmlNode, path: string, depth: number, insideNavigation: boolean) => {
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
          blockLevel: BLOCK_TAGS.has(node.tagName),
          classSignature: node.attrs.find((item) => item.name === 'class')?.value.trim() ?? '',
          depth,
          headingLevel: /^h[1-6]$/u.test(node.tagName) ? Number(node.tagName.slice(1)) : null,
          insideNavigation,
          path,
          startOffset,
          tagName: node.tagName,
          textOffset,
          title: readableElementTitle(node)
        });
      }
      insideNavigation ||= node.tagName === 'nav';
    }
    node.childNodes.forEach((child, index) => visit(child, `${path}.${index}`, depth + 1, insideNavigation));
  };
  visit(document, '0', 0, false);
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
  const title = collectStructuralLabel(element).replace(/\s+/gu, ' ').trim();
  return title ? title.slice(0, 120) : null;
}

function collectStructuralLabel(element: HtmlElement) {
  if (/^h[1-6]$/u.test(element.tagName)) return collectInlineText(element);
  const childHeading = element.childNodes.find((child): child is HtmlElement => (
    'tagName' in child && /^h[1-6]$/u.test(child.tagName)
  ));
  if (childHeading) return collectInlineText(childHeading);
  return element.childNodes.map((child) => (
    'tagName' in child && BLOCK_TAGS.has(child.tagName) ? '' : collectInlineText(child)
  )).join(' ');
}

function collectInlineText(node: HtmlNode): string {
  if (node.nodeName === '#text') return 'value' in node ? node.value : '';
  return 'childNodes' in node ? node.childNodes.map(collectInlineText).join(' ') : '';
}

function markerKey(marker: LocatedMarker) {
  return sha256(`${marker.attributeValue}\u001f${marker.path}`).slice(0, 24);
}

function missingMarkers(imageCount = 0): PreparedReadwiseApiEpubStructure {
  return {
    candidates: [],
    degradedReason: 'Reader EPUB table of contents markers were unavailable; imported as a single Topic.',
    imageCount,
    legacyRootBody: '',
    legacySections: [],
    legacyMarkerKeys: [],
    markerCount: 0,
    rootBody: '',
    sections: []
  };
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav',
  'ol', 'p', 'pre', 'section', 'table', 'ul'
]);

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
