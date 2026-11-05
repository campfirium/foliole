import { useCallback, useEffect, useState } from 'react';

import type { EditorTextAnchorDecoration } from '../features/editor/adapters/EditorAdapter';

type Range = { from: number; to: number };
type PendingRange = Range & { nodeId: string };

export function useCompanionPendingHighlightRanges(article: {
  nodeId: string;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}) {
  const [owned, setOwned] = useState<{ documentId: string; ranges: PendingRange[] }>({ documentId: article.nodeId, ranges: [] });
  useEffect(() => {
    setOwned(current => {
      if (current.documentId !== article.nodeId) return { documentId: article.nodeId, ranges: [] };
      const ranges = current.ranges.filter(range => !article.textAnchorDecorations.some(real =>
        real.nodeId === range.nodeId && real.from === range.from && real.to === range.to));
      return ranges.length === current.ranges.length ? current : { ...current, ranges };
    });
  }, [article.nodeId, article.textAnchorDecorations]);
  const stageRange = useCallback((nodeId: string, range: Range) => {
    const pending = { nodeId, ...range };
    setOwned(current => ({ documentId: article.nodeId, ranges: [
      ...(current.documentId === article.nodeId ? current.ranges.filter(entry => entry.nodeId !== nodeId) : []), pending
    ] }));
    return pending;
  }, [article.nodeId]);
  const restoreRange = useCallback((pending: PendingRange) => {
    setOwned(current => ({ ...current, ranges: current.ranges.filter(entry => entry !== pending) }));
  }, []);
  const applyRanges = useCallback((decorations: readonly EditorTextAnchorDecoration[]) => {
    if (owned.documentId !== article.nodeId || owned.ranges.length === 0) return decorations;
    return decorations.map(decoration => {
      const range = owned.ranges.find(entry => entry.nodeId === decoration.nodeId);
      return range ? { ...decoration, from: range.from, to: range.to } : decoration;
    });
  }, [article.nodeId, owned]);
  return { stageRange, restoreRange, applyRanges };
}
