import { useCallback, useEffect, useRef } from 'react';

import type { DailyFlowPredictionArgs } from '../../../../lib/core/flow/dailyFlowPrediction';
import type { DailyFlowSession } from '../../../../lib/core/flow/dailyFlowSession';

import { resolveNextDocumentId } from './documentPreparation';

type Window = Pick<DailyFlowSession, 'daily' | 'currentNodeId' | 'queueNodeIds' | 'flowFormat'>;

export function useFlowDocumentPrefetch(session: Window,
  predict: (args: DailyFlowPredictionArgs, signal: AbortSignal) => Promise<string | null>,
  prepare: (next: string | null, current: string | null) => void) {
  const running = useRef<AbortController | null>(null);
  const preparedSource = useRef<string | null>(null);
  const cancel = useCallback(() => running.current?.abort(), []);
  const latestPrepare = useRef(prepare);
  latestPrepare.current = prepare;
  useEffect(() => () => latestPrepare.current(null, null), []);
  const { currentNodeId, daily, flowFormat } = session;
  const legacyNext = resolveNextDocumentId(currentNodeId, session.queueNodeIds);
  useEffect(() => {
    const controller = new AbortController();
    running.current = controller;
    const source = JSON.stringify([flowFormat, currentNodeId, daily?.scope, daily?.dayKey]);
    if (preparedSource.current !== source) {
      preparedSource.current = source;
      prepare(null, currentNodeId);
    }
    if (flowFormat !== 'cycle-v1') {
      prepare(legacyNext, currentNodeId);
      return () => { controller.abort(); };
    }
    // Yield display and ordinary controls before preparing a speculative successor.
    const timer = setTimeout(() => {
      if (controller.signal.aborted || !daily || !currentNodeId) return;
      void predict({ token: daily, currentNodeId, now: new Date().toISOString() }, controller.signal)
        .then(next => { if (!controller.signal.aborted) prepare(next, currentNodeId); })
        .catch(() => { /* Demand reads remain authoritative after a prediction miss or failure. */ });
    }, 16);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [flowFormat, currentNodeId, daily?.scope, daily?.dayKey, daily?.revision, legacyNext, predict, prepare]);
  return cancel;
}
