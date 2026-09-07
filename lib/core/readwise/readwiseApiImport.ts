import { createHash } from 'node:crypto';

import { formatHighlightCardContent } from '../annotations/textAnnotationContent.js';
import { convertHtmlToMarkdownCompatible, formatHtmlConversionDegradedReason } from '../import/htmlToMarkdownCompatible.js';

import {
  resolveReaderBodyAncestor,
  type ExportBookContract,
  type ReaderDocumentContract
} from './readwiseApiContract.js';

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
  degradedReason: string | null;
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
  exportBooks: ExportBookContract[],
  previouslyVerifiedHighlightIds: ReadonlySet<string> = new Set()
): PreparedReadwiseApiDocument[] {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const verifiedHighlights = new Set([
    ...verifiedHighlightIds(exportBooks),
    ...previouslyVerifiedHighlightIds
  ]);
  const annotationsByDocument = new Map<string, PreparedReadwiseApiAnnotation[]>();
  const unmatchedByDocument = new Map<string, number>();
  for (const document of documents) {
    if (document.category !== 'highlight' && document.category !== 'note') continue;
    const ancestor = resolveReaderBodyAncestor(document.id, byId);
    const annotation = prepareAnnotation(document, byId, verifiedHighlights);
    if (!ancestor.documentId || !annotation) {
      if (ancestor.documentId) {
        unmatchedByDocument.set(ancestor.documentId, (unmatchedByDocument.get(ancestor.documentId) ?? 0) + 1);
      }
      continue;
    }
    const current = annotationsByDocument.get(ancestor.documentId) ?? [];
    current.push(annotation);
    annotationsByDocument.set(ancestor.documentId, current);
  }
  return documents.flatMap((document): PreparedReadwiseApiDocument[] => {
    if (!document.category || !BODY_CATEGORIES.has(document.category)) return [];
    const converted = convertHtmlToMarkdownCompatible(document.htmlContent ?? '');
    const title = document.title?.trim() || 'Untitled';
    return [{
      annotations: annotationsByDocument.get(document.id) ?? [],
      body: converted.content,
      category: document.category as PreparedReadwiseApiDocument['category'],
      degradedReason: converted.content.trim()
        ? formatHtmlConversionDegradedReason(converted.warnings)
        : 'Readable body is unavailable; this source was not imported.',
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
  byId: ReadonlyMap<string, ReaderDocumentContract>,
  verifiedHighlights: ReadonlySet<string>
): PreparedReadwiseApiAnnotation | null {
  const highlightId = document.category === 'note' ? document.parentId : document.id;
  if (!highlightId || !verifiedHighlights.has(highlightId)) return null;
  const converted = convertHtmlToMarkdownCompatible(document.htmlContent ?? '');
  const text = converted.content.trim() || document.title?.trim() || document.summary?.trim() || '';
  const note = document.category === 'highlight' ? document.notes?.trim() : '';
  const content = formatHighlightCardContent({ ...(note ? { note } : {}), text });
  if (!content) return null;
  const kind = document.category === 'note' ? 'note' : 'highlight';
  return {
    content,
    contentHash: sha256(content),
    kind,
    locatorText: document.category === 'highlight' ? text : null,
    parentRemoteId: document.parentId,
    remoteId: document.id,
    updatedAt: document.updatedAt
  };
}

function verifiedHighlightIds(exportBooks: ExportBookContract[]) {
  return new Set(exportBooks
    .filter((book) => book.source === 'reader' && !book.isDeleted)
    .flatMap((book) => book.highlightExternalIds));
}

export function stableReadwiseAnnotationNodeId(connectionRef: string, remoteId: string) {
  return `node-readwise-${sha256(`${connectionRef}\u001f${remoteId}`).slice(0, 32)}`;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
