import type http from 'node:http';

import { SYNC_SESSION_WAIT_MS } from '../../lib/platform/syncSessionContract.js';
import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

import type { HttpBodyTiming } from './desktopFramedSyncHttpBody.js';

type SessionWaitTiming = { waitStartedAt: number; waitEndedAt: number; waitDurationMs: number; changed: boolean };
const sessionWaits = new WeakMap<http.ServerResponse, SessionWaitTiming>();
export type RequestDatabasePhase = 'runtime_resolution' | 'write_owner_wait' | 'write_owner_held' | 'read_prepare' | 'read_snapshot';
export type RequestDatabaseTiming = (phase: RequestDatabasePhase, durationMs: number) => void;
const databaseTimings = new WeakMap<http.ServerResponse, Partial<Record<RequestDatabasePhase, { calls: number; durationMs: number }>>>();

export type RequestHttpPhase = 'body_verification' | 'request_decode' | 'business_handler' |
  'response_spool_inclusive' | 'response_send';
type HttpSpan = { phase: RequestHttpPhase; started: number; ended?: number };
const httpTimings = new WeakMap<http.ServerResponse, HttpSpan[]>();
type BodyPhase = Parameters<HttpBodyTiming>[0];
const bodyTimings = new WeakMap<http.ServerResponse, Partial<Record<BodyPhase, { calls: number; durationMs: number }>>>();

export function requestBodyTiming(response: http.ServerResponse): HttpBodyTiming {
  return (phase, durationMs) => {
    const timings = bodyTimings.get(response);
    if (!timings) return;
    const previous = timings[phase] ?? { calls: 0, durationMs: 0 };
    timings[phase] = { calls: previous.calls + 1, durationMs: previous.durationMs + durationMs };
  };
}

/** Spooling includes handler work; sending includes replay and response spool cleanup. */
export function beginRequestHttpPhase(response: http.ServerResponse, phase: RequestHttpPhase) {
  const spans = httpTimings.get(response);
  if (!spans) return () => {};
  const span: HttpSpan = { phase, started: performance.now() };
  spans.push(span);
  return () => { span.ended ??= performance.now(); };
}

function completedHttpTimings(response: http.ServerResponse, ended: number) {
  const spans = httpTimings.get(response);
  httpTimings.delete(response);
  return spans?.map(span => ({ phase: span.phase,
    durationMs: (span.ended ?? ended) - span.started, completed: span.ended !== undefined }));
}

export function requestDatabaseTiming(response: http.ServerResponse): RequestDatabaseTiming {
  return (phase, durationMs) => {
    const timings = databaseTimings.get(response);
    if (!timings) return;
    const previous = timings[phase] ?? { calls: 0, durationMs: 0 };
    timings[phase] = { calls: previous.calls + 1, durationMs: previous.durationMs + durationMs };
  };
}

export function recordSyncSessionWaitTiming(response: http.ServerResponse, timing: SessionWaitTiming) {
  sessionWaits.set(response, timing);
}

// Measures response lifetime from Node's handler entry, excluding connection/header transport.
// A close event does not measure work that continues after the response disconnects.
export function observeSlowRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  databaseTimings.set(response, {});
  httpTimings.set(response, []);
  bodyTimings.set(response, {});
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
    const ended = performance.now();
    const durationMs = ended - started;
    const httpPhases = completedHttpTimings(response, ended);
    const wait = sessionWaits.get(response);
    sessionWaits.delete(response);
    const database = databaseTimings.get(response);
    databaseTimings.delete(response);
    const body = bodyTimings.get(response);
    bodyTimings.delete(response);
    if (isSessionWait && completion === 'finish' && response.statusCode === 200 &&
        wait?.changed === false && wait.waitDurationMs >= SYNC_SESSION_WAIT_MS) return;
    if (!isSessionWait && durationMs < 250) return;
    void appendDiagnosticLog({ event: 'companion_lan_slow_request', level: 'debug',
      occurred_at: new Date().toISOString(), source: 'electron.main',
      payload: { durationMs, startedAt, endedAt: Date.now(), bodyReceivedAt, requestPath: url.pathname,
        durationScope: 'response_lifetime', ...(wait ?? {}), databaseTimings: database, httpPhases,
        bodyTimings: body,
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
