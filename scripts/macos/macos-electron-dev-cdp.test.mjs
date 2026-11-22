// @vitest-environment node
/* global queueMicrotask */
import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import {
  findCdpBrowserPid,
  requestCdpBrowserProcessInfo,
  verifyMacosElectronDevCdpOwnership
} from './macos-electron-dev-cdp.mjs';

const WS_URL = 'ws://127.0.0.1:9333/devtools/browser/abc';

function versionFetch() {
  return vi.fn(async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: WS_URL }) }));
}

function processInfo(browserPid) {
  return [{ cpuTime: 1, id: 7001, type: 'renderer' }, { cpuTime: 2, id: browserPid, type: 'browser' }];
}

it('accepts a CDP port whose browser process is the runtime this launch started', async () => {
  const requestProcessInfo = vi.fn(async () => processInfo(4242));
  await expect(verifyMacosElectronDevCdpOwnership({
    fetchImpl: versionFetch(), port: 9333, requestProcessInfo, runtimePid: 4242
  })).resolves.toEqual({ browserPid: 4242, port: 9333 });
  expect(requestProcessInfo).toHaveBeenCalledWith(WS_URL, expect.any(Object));
});

it('rejects a CDP port held by a stale Electron and names it as already in use', async () => {
  await expect(verifyMacosElectronDevCdpOwnership({
    fetchImpl: versionFetch(), port: 9333,
    requestProcessInfo: async () => processInfo(1111), runtimePid: 4242
  })).rejects.toThrow('CDP port 9333 already in use by another process (browser pid=1111, runtime pid=4242)');
});

it('refuses to confirm ownership when no browser process is reported', async () => {
  await expect(verifyMacosElectronDevCdpOwnership({
    fetchImpl: versionFetch(), port: 9333,
    requestProcessInfo: async () => [{ id: 7001, type: 'renderer' }], runtimePid: 4242
  })).rejects.toThrow('did not report a browser process');
});

it('fails after retries when the CDP endpoint never answers', async () => {
  const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
  await expect(verifyMacosElectronDevCdpOwnership({
    attempts: 3, fetchImpl, port: 9333, requestProcessInfo: vi.fn(), retryDelayMs: 1, runtimePid: 4242
  })).rejects.toThrow('CDP port 9333 is not reachable for runtime pid=4242: ECONNREFUSED');
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

it('reads only a browser-typed process id', () => {
  expect(findCdpBrowserPid(processInfo(55))).toBe(55);
  expect(findCdpBrowserPid([{ id: 1, type: 'gpu' }])).toBeNull();
  expect(findCdpBrowserPid(null)).toBeNull();
});

class FakeSocket extends EventEmitter {
  constructor(reply) {
    super();
    this.reply = reply;
    this.sent = [];
    queueMicrotask(() => this.emit('open'));
  }
  addEventListener(name, handler) { this.on(name, handler); }
  close() { this.closed = true; }
  send(data) {
    this.sent.push(JSON.parse(data));
    queueMicrotask(() => {
      this.emit('message', { data: JSON.stringify({ id: 99, result: {} }) });
      this.emit('message', { data: JSON.stringify({ id: 1, ...this.reply }) });
    });
  }
}

it('asks the browser target for SystemInfo.getProcessInfo and returns its process list', async () => {
  let socket;
  const result = await requestCdpBrowserProcessInfo(WS_URL, {
    createSocket: () => (socket = new FakeSocket({ result: { processInfo: processInfo(9) } }))
  });
  expect(socket.sent).toEqual([{ id: 1, method: 'SystemInfo.getProcessInfo' }]);
  expect(findCdpBrowserPid(result)).toBe(9);
  expect(socket.closed).toBe(true);
});

it('surfaces a protocol error from SystemInfo.getProcessInfo', async () => {
  await expect(requestCdpBrowserProcessInfo(WS_URL, {
    createSocket: () => new FakeSocket({ error: { message: 'not found' } })
  })).rejects.toThrow('SystemInfo.getProcessInfo failed: not found');
});
