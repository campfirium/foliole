import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';

import type { CompanionHighlightRangeHandler } from './companionHighlightRangePersistence';
import {
  createCompanionPendingTextAnchorDecorations,
  mergeCompanionPendingTextAnchorDecorations,
  removeResolvedCompanionPendingTextAnchorDecorations
} from './companionPendingTextAnchorDecorations';
import type { CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import { CompanionSelectionRefreshError } from './companionSelectionRefreshError';
import { useCompanionPendingHighlightRanges } from './useCompanionPendingHighlightRanges';

import type { EditorTextAnchorDecoration } from '@/features/editor/adapters/EditorAdapter';
import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

interface PendingReadableArticle {
  nodeId: string;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}

function excludePendingDeletedDecorations(args: {
  deletedNodeIds: readonly string[];
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}) {
  if (args.deletedNodeIds.length === 0) return args.textAnchorDecorations;
  const deletedNodeIds = new Set(args.deletedNodeIds);
  return args.textAnchorDecorations.filter((decoration) => !decoration.nodeId || !deletedNodeIds.has(decoration.nodeId));
}

function keepUnresolvedDeletedNodeIds(args: {
  deletedNodeIds: readonly string[];
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}) {
  if (args.deletedNodeIds.length === 0) return args.deletedNodeIds;
  const visibleNodeIds = new Set(args.textAnchorDecorations.map((decoration) => decoration.nodeId).filter(Boolean));
  return args.deletedNodeIds.filter((nodeId) => visibleNodeIds.has(nodeId));
}

export function useCompanionPendingReadableArticle<T extends PendingReadableArticle>(readableArticle: T) {
  const ranges = useCompanionPendingHighlightRanges(readableArticle);
  const [pendingDecorations, setPendingDecorations] = useState<readonly EditorTextAnchorDecoration[]>([]);
  const [pendingDeletedNodeIds, setPendingDeletedNodeIds] = useState<readonly string[]>([]);

  useEffect(() => {
    setPendingDecorations([]);
    setPendingDeletedNodeIds([]);
  }, [readableArticle.nodeId]);
  useEffect(() => {
    setPendingDecorations((pending) => removeResolvedCompanionPendingTextAnchorDecorations({
      pending,
      real: readableArticle.textAnchorDecorations
    }));
    setPendingDeletedNodeIds((deletedNodeIds) => keepUnresolvedDeletedNodeIds({
      deletedNodeIds,
      textAnchorDecorations: readableArticle.textAnchorDecorations
    }));
  }, [readableArticle.textAnchorDecorations]);

  const articleWithPendingDecorations = useMemo(() => ({
    ...readableArticle,
    textAnchorDecorations: ranges.applyRanges(mergeCompanionPendingTextAnchorDecorations({
      pending: pendingDecorations,
      real: excludePendingDeletedDecorations({
        deletedNodeIds: pendingDeletedNodeIds,
        textAnchorDecorations: readableArticle.textAnchorDecorations
      })
    }))
  }), [pendingDecorations, pendingDeletedNodeIds, readableArticle, ranges.applyRanges]);

  const stageSelectionAnnotation = useCallback((kind: CompanionSelectionAnnotationKind, payload: SelectionCommandPayload) => {
    setPendingDecorations((pending) => mergeCompanionPendingTextAnchorDecorations({
      pending: createCompanionPendingTextAnchorDecorations(kind, payload),
      real: pending
    }));
  }, []);

  const stageDeletedHighlight = useCallback((nodeId: string) => {
    setPendingDeletedNodeIds((nodeIds) => (nodeIds.includes(nodeId) ? nodeIds : [...nodeIds, nodeId]));
  }, []);

  const restoreDeletedHighlight = useCallback((nodeId: string) => {
    setPendingDeletedNodeIds((nodeIds) => nodeIds.filter((currentNodeId) => currentNodeId !== nodeId));
  }, []);

  return {
    stageRange: ranges.stageRange,
    restoreRange: ranges.restoreRange,
    readableArticle: articleWithPendingDecorations,
    restoreDeletedHighlight,
    stageDeletedHighlight,
    stageSelectionAnnotation
  };
}

export function createPendingAnnotationActions(
  props: {
    onCreateSelectionAnnotation?: (kind: CompanionSelectionAnnotationKind, payload: SelectionCommandPayload, note?: string) => Promise<string | null> | string | null;
    onDeleteExistingHighlight?: (nodeId: string, guard?: CompanionHighlightReadGuard) => Promise<string | null> | string | null;
    onAdjustExistingHighlightRange?: CompanionHighlightRangeHandler;
  },
  pendingReadableArticle: ReturnType<typeof useCompanionPendingReadableArticle>
) {
  function createSelectionAnnotation(
    kind: CompanionSelectionAnnotationKind,
    payload: SelectionCommandPayload,
    note?: string
  ) {
    pendingReadableArticle.stageSelectionAnnotation(kind, payload);
    return props.onCreateSelectionAnnotation?.(kind, payload, note) ?? null;
  }
  function deleteExistingHighlight(nodeId: string, guard?: CompanionHighlightReadGuard) {
    pendingReadableArticle.stageDeletedHighlight(nodeId);
    const result = props.onDeleteExistingHighlight?.(nodeId, guard) ?? null;
    return Promise.resolve(result).catch((error) => {
      if (!(error instanceof CompanionSelectionRefreshError)) pendingReadableArticle.restoreDeletedHighlight(nodeId);
      throw error;
    });
  }
  const adjustExistingHighlightRange: CompanionHighlightRangeHandler = async (nodeId, range, content, guard) => {
    const pending = pendingReadableArticle.stageRange(nodeId, range);
    try {
      const result = await props.onAdjustExistingHighlightRange?.(nodeId, range, content, guard) ?? null;
      if (!result) pendingReadableArticle.restoreRange(pending);
      return result;
    } catch (error) {
      if (!(error instanceof CompanionSelectionRefreshError)) pendingReadableArticle.restoreRange(pending);
      throw error;
    }
  };
  return { createSelectionAnnotation, deleteExistingHighlight, adjustExistingHighlightRange };
}
