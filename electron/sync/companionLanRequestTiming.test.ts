import http from 'node:http';
import { Socket } from 'node:net';

import { afterEach, expect, it, vi } from 'vitest';

import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

import { beginRequestHttpPhase, observeSlowRequest, recordSyncSessionWaitTiming, requestDatabaseTiming } from './companionLanRequestTiming.js';

vi.mock('../diagnostics/diagnosticLog.js', () => ({ appendDiagnosticLog: vi.fn(async () => undefined) }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function requestPair(method = 'POST', url = '/sync?request=inventory') {
  const request = new http.IncomingMessage(new Socket());
  request.method = method;
  request.url = url;
  const response = new http.ServerResponse(request);
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(500);
  observeSlowRequest(request, response);
  return { request, response };
}

it('records an interrupted slow response without requiring finish or a complete request body', () => {
  const { response } = requestPair();
  response.emit('close');
  expect(appendDiagnosticLog).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ durationMs: 500, completion: 'close', responseFinished: false,
      bodyReceivedAt: null, method: 'POST', operation: 'inventory' })
  }));
});

it('records a finished slow response only once when close follows finish', () => {
  const { request, response } = requestPair();
  request.emit('end');
  response.end();
  response.emit('finish');
  response.emit('close');
  expect(appendDiagnosticLog).toHaveBeenCalledTimes(1);
  expect(appendDiagnosticLog).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ completion: 'finish', bodyReceivedAt: expect.any(Number) })
  }));
});

it('omits only a completed, unchanged session wait that reached its timeout', () => {
  const { response } = requestPair('GET', '/companion/sync-session');
  recordSyncSessionWaitTiming(response, { changed: false, waitStartedAt: 10,
    waitEndedAt: 20010, waitDurationMs: 20000 });
  response.emit('finish');
  expect(appendDiagnosticLog).not.toHaveBeenCalled();
});

it.each(['finish', 'close'] as const)('records a fast session wake or disconnect ending with %s', completion => {
  const { response } = requestPair('GET', '/companion/sync-session');
  vi.mocked(performance.now).mockReturnValue(10);
  response.emit(completion);
  expect(appendDiagnosticLog).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ completion, method: 'GET', durationMs: 10,
      startedAt: expect.any(Number), endedAt: expect.any(Number), durationScope: 'response_lifetime' })
  }));
});

it.each([true, false])('keeps a long wait that changed or disconnected: changed=%s', changed => {
  const { response } = requestPair('GET', '/companion/sync-session');
  recordSyncSessionWaitTiming(response, { changed, waitStartedAt: 10,
    waitEndedAt: 20010, waitDurationMs: 20000 });
  response.emit(changed ? 'finish' : 'close');
  expect(appendDiagnosticLog).toHaveBeenCalledTimes(1);
});

it('keeps slow POST session notifications', () => {
  requestPair('POST', '/companion/sync-session').response.emit('finish');
  expect(appendDiagnosticLog).toHaveBeenCalledTimes(1);
});

it('omits fast requests', () => {
  const { response } = requestPair();
  vi.mocked(performance.now).mockReturnValue(100);
  response.emit('close');
  expect(appendDiagnosticLog).not.toHaveBeenCalled();
});

it('keeps database phase totals on their response and stops collecting after completion', () => {
  const { response } = requestPair();
  const timing = requestDatabaseTiming(response);
  timing('write_owner_wait', 100);
  timing('write_owner_wait', 25);
  timing('write_owner_held', 40);
  response.emit('finish');
  timing('write_owner_held', 900);
  response.emit('close');
  expect(appendDiagnosticLog).toHaveBeenCalledTimes(1);
  expect(appendDiagnosticLog).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ databaseTimings: {
      write_owner_wait: { calls: 2, durationMs: 125 }, write_owner_held: { calls: 1, durationMs: 40 }
    } })
  }));
});

it('reports nested phase durations without adding them and captures an active send at finish', () => {
  const { response } = requestPair();
  vi.mocked(performance.now).mockReturnValue(10);
  const verified = beginRequestHttpPhase(response, 'body_verification');
  vi.mocked(performance.now).mockReturnValue(30);
  verified();
  const spool = beginRequestHttpPhase(response, 'response_spool_inclusive');
  const business = beginRequestHttpPhase(response, 'business_handler');
  vi.mocked(performance.now).mockReturnValue(100);
  business();
  vi.mocked(performance.now).mockReturnValue(200);
  spool();
  const sent = beginRequestHttpPhase(response, 'response_send');
  vi.mocked(performance.now).mockReturnValue(500);
  response.emit('finish');
  sent();
  verified();
  response.emit('close');
  expect(appendDiagnosticLog).toHaveBeenCalledTimes(1);
  expect(appendDiagnosticLog).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ httpPhases: [
      { phase: 'body_verification', durationMs: 20, completed: true },
      { phase: 'response_spool_inclusive', durationMs: 170, completed: true },
      { phase: 'business_handler', durationMs: 70, completed: true },
      { phase: 'response_send', durationMs: 300, completed: false }
    ] })
  }));
});
