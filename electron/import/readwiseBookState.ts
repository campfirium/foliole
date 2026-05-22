import type {
  ReadwiseBookAnnotationStatus,
  ReadwiseBookBodyState,
  ReadwiseBookHighlightState,
  ReadwiseBookImportStatus,
  ReadwiseBookInventoryItem
} from './readwiseBooksInventory.js';

export interface ReadwiseBookHighlightPlacementSummary {
  matchedCount: number;
  unmatchedCount: number;
}

export function resolveReadwiseBookBodyState(importStatus: ReadwiseBookImportStatus): ReadwiseBookBodyState {
  return importStatus === 'completed' ? 'loaded' : 'unloaded';
}

export function resolveInitialReadwiseBookHighlightState(input: {
  annotationStatus: ReadwiseBookAnnotationStatus;
}): ReadwiseBookHighlightState | null {
  if (input.annotationStatus !== 'has_highlights') {
    return null;
  }
  return 'pending';
}

export function resolvePlacedReadwiseBookHighlightState(
  placement: ReadwiseBookHighlightPlacementSummary
): ReadwiseBookHighlightState | null {
  const totalCount = placement.matchedCount + placement.unmatchedCount;
  if (totalCount === 0) {
    return null;
  }
  if (placement.matchedCount === totalCount) {
    return 'placed';
  }
  if (placement.matchedCount > 0) {
    return 'partial';
  }
  return 'failed';
}

export function applyReadwiseBookPlacementState<T extends ReadwiseBookInventoryItem>(
  book: T,
  placement: ReadwiseBookHighlightPlacementSummary
): T {
  return {
    ...book,
    bodyState: 'loaded',
    highlightState: resolvePlacedReadwiseBookHighlightState(placement),
    highlightUnmatchedCount: placement.unmatchedCount
  };
}

export function resolveReadwiseBookHighlightProgress(
  book: ReadwiseBookInventoryItem,
  persistedBook?: ReadwiseBookInventoryItem
): Pick<ReadwiseBookInventoryItem, 'highlightCount' | 'highlightState' | 'highlights' | 'highlightUnmatchedCount'> {
  if (book.annotationStatus !== 'has_highlights') {
    return { highlightCount: 0, highlightState: null, highlights: [], highlightUnmatchedCount: null };
  }
  return {
    highlightCount: book.highlightCount,
    highlightState: persistedBook?.highlightState ?? book.highlightState ?? 'pending',
    highlights: book.highlights,
    highlightUnmatchedCount: persistedBook?.highlightUnmatchedCount ?? book.highlightUnmatchedCount ?? null
  };
}
