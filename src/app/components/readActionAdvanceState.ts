import { useEffect, useState, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { isReadActionAdvanceReadyFromMetrics } from '../../features/review/model/readActionAdvanceReady';

export { isReadActionAdvanceReadyFromMetrics };

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
