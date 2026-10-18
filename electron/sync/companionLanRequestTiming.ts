import type http from 'node:http';

import { SYNC_SESSION_WAIT_MS } from '../../lib/platform/syncSessionContract.js';
import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

type SessionWaitTiming = { waitStartedAt: number; waitEndedAt: number; waitDurationMs: number; changed: boolean };
const sessionWaits = new WeakMap<http.ServerResponse, SessionWaitTiming>();

export function recordSyncSessionWaitTiming(response: http.ServerResponse, timing: SessionWaitTiming) {
  sessionWaits.set(response, timing);
}

// Measures response lifetime from Node's handler entry, excluding connection/header transport.
// A close event does not measure work that continues after the response disconnects.
export function observeSlowRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const isSessionWait = request.method === 'GET' && url.pathname === '/companion/sync-session';
  const startedAt = Date.now();
  const started = performance.now();
  let bodyReceivedAt: number | null = null;
  let recorded = false;
  const onEnd = () => { bodyReceivedAt = Date.now(); };
  const record = (completion: 'finish' | 'close') => {
    if (recorded) return;
    recorded = true;
    request.off('end', onEnd);
    response.off('finish', onFinish);
    response.off('close', onClose);
    const durationMs = performance.now() - started;
    const wait = sessionWaits.get(response);
    sessionWaits.delete(response);
    if (isSessionWait && completion === 'finish' && response.statusCode === 200 &&
        wait?.changed === false && wait.waitDurationMs >= SYNC_SESSION_WAIT_MS) return;
    if (!isSessionWait && durationMs < 250) return;
    void appendDiagnosticLog({ event: 'companion_lan_slow_request', level: 'debug',
      occurred_at: new Date().toISOString(), source: 'electron.main',
      payload: { durationMs, startedAt, endedAt: Date.now(), bodyReceivedAt, requestPath: url.pathname,
        durationScope: 'response_lifetime', ...(wait ?? {}),
        method: request.method ?? null, completion, responseFinished: response.writableFinished,
        operation: url.searchParams.get('request'), statusCode: response.statusCode }
    }).catch(() => undefined);
  };
  const onFinish = () => record('finish');
  const onClose = () => record('close');
  request.once('end', onEnd);
  response.once('finish', onFinish);
  response.once('close', onClose);
}
