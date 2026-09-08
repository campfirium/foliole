import { createHash } from 'node:crypto';

import { formatHighlightCardContent } from '../annotations/textAnnotationContent.js';
import { convertHtmlToMarkdownCompatible, formatHtmlConversionDegradedReason } from '../import/htmlToMarkdownCompatible.js';

import {
  resolveReaderBodyAncestor,
  type ExportBookContract,
  type ExportHighlightContract,
  type ReaderDocumentContract
} from './readwiseApiContract.js';
import {
  prepareReadwiseApiEpubStructure,
  type PreparedReadwiseApiEpubStructure
} from './readwiseApiEpubStructure.js';

const BODY_CATEGORIES = new Set(['article', 'email', 'epub', 'pdf', 'rss', 'tweet', 'video']);

export interface PreparedReadwiseApiAnnotation {
  content: string;
  contentHash: string;
  kind: 'highlight' | 'note';
  locatorText: string | null;
  parentRemoteId: string | null;
  remoteId: string;
  updatedAt: string | null;
}

export interface PreparedReadwiseApiDocument {
  annotations: PreparedReadwiseApiAnnotation[];
  body: string;
  category: Exclude<ReaderDocumentContract['category'], 'highlight' | 'note' | null>;
  coverImageUrl: string | null;
  degradedReason: string | null;
  epubStructure?: PreparedReadwiseApiEpubStructure | null;
  id: string;
  metadata: ReadwiseApiSourceMetadata;
  title: string;
  unmatchedAnnotationCount: number;
  updatedAt: string | null;
}

export interface ReadwiseApiSourceMetadata extends Record<string, unknown> {
  author: string | null;
  category: string;
  readerUrl: string | null;
  sourceUrl: string | null;
  title: string;
}

export function prepareReadwiseApiDocuments(
  documents: ReaderDocumentContract[],
  exportBooks: ExportBookContract[]
): PreparedReadwiseApiDocument[] {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const exportedHighlights = indexExportedHighlights(exportBooks);
  const annotationsByDocument = new Map<string, PreparedReadwiseApiAnnotation[]>();
  const unmatchedByDocument = new Map<string, number>();
  for (const document of documents) {
    if (document.category !== 'highlight' && document.category !== 'note') continue;
    const ancestor = resolveReaderBodyAncestor(document.id, byId);
    const exported = document.category === 'highlight'
      ? exportedHighlights.get(document.id)
      : document.parentId ? exportedHighlights.get(document.parentId) : null;
    const joined = Boolean(ancestor.documentId && exported?.documentId === ancestor.documentId);
    const annotation = document.category === 'highlight' && joined && exported
      ? prepareAnnotation(document, exported.highlight)
      : null;
    const foldedNote = document.category === 'note' && joined && Boolean(exported?.highlight.note);
    if (!ancestor.documentId || (!annotation && !foldedNote)) {
      if (ancestor.documentId) {
        unmatchedByDocument.set(ancestor.documentId, (unmatchedByDocument.get(ancestor.documentId) ?? 0) + 1);
      }
      continue;
    }
    if (!annotation) continue;
    const current = annotationsByDocument.get(ancestor.documentId) ?? [];
    current.push(annotation);
    annotationsByDocument.set(ancestor.documentId, current);
  }
  return documents.flatMap((document): PreparedReadwiseApiDocument[] => {
    if (!document.category || !BODY_CATEGORIES.has(document.category)) return [];
    const converted = convertHtmlToMarkdownCompatible(document.htmlContent ?? '');
    const epubStructure = document.category === 'epub'
      ? prepareReadwiseApiEpubStructure(document.htmlContent ?? '')
      : null;
    const title = document.title?.trim() || 'Untitled';
    return [{
      annotations: annotationsByDocument.get(document.id) ?? [],
      body: converted.content,
      category: document.category as PreparedReadwiseApiDocument['category'],
      coverImageUrl: document.imageUrl,
      degradedReason: converted.content.trim()
        ? (epubStructure?.degradedReason ?? formatHtmlConversionDegradedReason(converted.warnings))
        : 'Readable body is unavailable; this source was not imported.',
      epubStructure,
      id: document.id,
      metadata: {
        author: document.author,
        category: document.category,
        readerUrl: document.url,
        sourceUrl: document.sourceUrl,
        title
      },
      title,
      unmatchedAnnotationCount: unmatchedByDocument.get(document.id) ?? 0,
      updatedAt: document.updatedAt
    }];
  });
}

function prepareAnnotation(
  document: ReaderDocumentContract,
  exported: ExportHighlightContract
): PreparedReadwiseApiAnnotation | null {
  if (exported.isDeleted) return null;
  const text = exported.text?.trim() ?? '';
  const note = exported.note?.trim() ?? '';
  const content = formatHighlightCardContent({ ...(note ? { note } : {}), text });
  if (!content) return null;
  return {
    content,
    contentHash: sha256(content),
    kind: 'highlight',
    locatorText: text || null,
    parentRemoteId: document.parentId,
    remoteId: document.id,
    updatedAt: exported.updatedAt ?? document.updatedAt
  };
}

function indexExportedHighlights(exportBooks: ExportBookContract[]) {
  const index = new Map<string, { documentId: string; highlight: ExportHighlightContract }>();
  const conflicts = new Set<string>();
  for (const book of exportBooks) {
    if (book.source !== 'reader' || book.isDeleted || !book.externalId) continue;
    for (const highlight of book.highlights) {
      const existing = index.get(highlight.externalId);
      if (existing && existing.documentId !== book.externalId) conflicts.add(highlight.externalId);
      else index.set(highlight.externalId, { documentId: book.externalId, highlight });
    }
  }
  for (const id of conflicts) index.delete(id);
  return index;
}

export function stableReadwiseAnnotationNodeId(connectionRef: string, remoteId: string) {
  return `node-readwise-${sha256(`${connectionRef}\u001f${remoteId}`).slice(0, 32)}`;
}

export function stableReadwiseEpubNodeId(connectionRef: string, documentId: string, markerKey: string) {
  return `node-epub-${sha256(`${connectionRef}\u001f${documentId}\u001f${markerKey}`).slice(0, 24)}`;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
