import { app } from 'electron';

import {
  finishRequestSyncPerformance, requestSyncPerformance, startRequestSyncPerformance
} from '../../lib/core/sync/requestSyncPerformance.js';

const label = process.env.FOLIOLE_SYNC_PERFORMANCE_LABEL;
const enabled = process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1'
  && Boolean(process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT?.trim())
  && label && /^[a-zA-Z0-9_-]{1,64}$/u.test(label) && app.isPackaged === false;
type InboundWindow = { signal: AbortSignal; outcome: 'complete' | 'partial' | 'failed' };
let active: InboundWindow | undefined;

export function beginDesktopInboundSyncPerformance(signal: AbortSignal) {
  if (!enabled || active || requestSyncPerformance || signal.aborted) return;
  startRequestSyncPerformance();
  const window: InboundWindow = { signal, outcome: 'failed' };
  active = window;
  signal.addEventListener('abort', () => {
    active = undefined;
    console.info('[sync-performance]', JSON.stringify({
      label, role: 'provider', scope: 'inbound_peer_round', ...finishRequestSyncPerformance(window.outcome)
    }));
  }, { once: true });
}

export function measuresDesktopInboundSyncPerformance(signal: AbortSignal) {
  return active?.signal === signal;
}

export function completeDesktopInboundSyncPerformance(signal: AbortSignal, attachmentsConfirmed: boolean) {
  if (active?.signal === signal) active.outcome = attachmentsConfirmed ? 'complete' : 'partial';
}
