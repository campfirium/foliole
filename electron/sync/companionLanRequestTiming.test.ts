import http from 'node:http';
import { Socket } from 'node:net';

import { afterEach, expect, it, vi } from 'vitest';

import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

import { observeSlowRequest } from './companionLanRequestTiming.js';

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

it('excludes GET session long polls but keeps POST session notifications', () => {
  requestPair('GET', '/companion/sync-session').response.emit('close');
  expect(appendDiagnosticLog).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  requestPair('POST', '/companion/sync-session').response.emit('close');
  expect(appendDiagnosticLog).toHaveBeenCalledTimes(1);
});

it('omits fast requests', () => {
  const { response } = requestPair();
  vi.mocked(performance.now).mockReturnValue(100);
  response.emit('close');
  expect(appendDiagnosticLog).not.toHaveBeenCalled();
});
