import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createCompanionPendingTextAnchorDecorations,
  mergeCompanionPendingTextAnchorDecorations,
  removeResolvedCompanionPendingTextAnchorDecorations
} from './companionPendingTextAnchorDecorations';
import type { CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';

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
    textAnchorDecorations: mergeCompanionPendingTextAnchorDecorations({
      pending: pendingDecorations,
      real: excludePendingDeletedDecorations({
        deletedNodeIds: pendingDeletedNodeIds,
        textAnchorDecorations: readableArticle.textAnchorDecorations
      })
    })
  }), [pendingDecorations, pendingDeletedNodeIds, readableArticle]);

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
    readableArticle: articleWithPendingDecorations,
    restoreDeletedHighlight,
    stageDeletedHighlight,
    stageSelectionAnnotation
  };
}
