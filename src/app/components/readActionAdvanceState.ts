import { useEffect, useState, type MutableRefObject } from 'react';

import type { EditorAdapter, EditorScrollMetrics } from '../../features/editor/adapters/EditorAdapter';

const ADVANCE_READY_MIN_REMAINING_PX = 120;
const ADVANCE_READY_VIEWPORT_RATIO = 0.2;

export function isReadActionAdvanceReadyFromMetrics(metrics: EditorScrollMetrics) {
  const viewportBottom = metrics.scrollTop + metrics.clientHeight;
  const contentPaddingBottom = Math.max(metrics.contentPaddingBottom ?? 0, 0);
  const realContentBottom = Math.max(metrics.scrollHeight - contentPaddingBottom, 0);
  const remainingRealContentPx = realContentBottom - viewportBottom;
  const thresholdPx = Math.max(ADVANCE_READY_MIN_REMAINING_PX, metrics.clientHeight * ADVANCE_READY_VIEWPORT_RATIO);
  return remainingRealContentPx <= thresholdPx;
}

export function useReadActionAdvanceState(args: {
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
  enabled: boolean;
  resetKey: string | null;
}) {
  const { editorAdapterRef, enabled, resetKey } = args;
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsReady(false);
      return;
    }
    const adapter = editorAdapterRef.current;
    const update = () => setIsReady(adapter ? isReadActionAdvanceReadyFromMetrics(adapter.getScrollMetrics()) : false);
    update();
    return adapter?.onScroll(update);
  }, [editorAdapterRef, enabled, resetKey]);

  return enabled && isReady;
}
