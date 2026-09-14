import {
  loadReadwiseApiAnnotationLedger,
  loadReadwiseApiExportIndex,
  saveReadwiseApiAnnotationContentStates
} from '../database/readwiseApiIndexStage.js';

export function indexReadwiseApiExportAnnotationContent(
  connectionRef: string,
  books: ReturnType<typeof loadReadwiseApiExportIndex>,
  seenInRun: string
) {
  const ids = books.flatMap((book) => book.highlights
    .filter((item) => !item.isDeleted && Boolean(item.text || item.note))
    .map((item) => item.externalId));
  saveReadwiseApiAnnotationContentStates(connectionRef, new Set(ids), seenInRun);
}

export function indexReadwiseApiExportMatches(
  annotations: ReturnType<typeof loadReadwiseApiAnnotationLedger>,
  books: ReturnType<typeof loadReadwiseApiExportIndex>
) {
  const highlightParentById = new Map(annotations.filter((item) =>
    item.category === 'highlight' && item.resolution !== 'article-parent-unavailable')
    .map((item) => [item.remoteId, item.parentId]));
  return new Map(books.flatMap((book) => {
    const matched = book.highlightExternalIds.filter((id) => highlightParentById.has(id));
    if (book.externalId && matched.some((id) => highlightParentById.get(id) !== book.externalId)) {
      throw new Error('readwise_api_annotation_identity_conflict');
    }
    return book.externalId && matched.length ? [[book.externalId, matched] as const] : [];
  }));
}
