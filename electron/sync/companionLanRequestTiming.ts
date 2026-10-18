import type http from 'node:http';

import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

// Measures Node handler lifetime, excluding connection setup and incoming header transport.
export function observeSlowRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/companion/sync-session') return;
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
    if (durationMs < 250) return;
    void appendDiagnosticLog({ event: 'companion_lan_slow_request', level: 'debug',
      occurred_at: new Date().toISOString(), source: 'electron.main',
      payload: { durationMs, startedAt, bodyReceivedAt, requestPath: url.pathname,
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
