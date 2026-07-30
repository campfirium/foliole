// @vitest-environment node

import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';

import {
  createA5LiveReloadPlugin, startWindowsA5LiveReloadServer, WINDOWS_A5_LIVE_RELOAD_PORT
} from './windows-a5-live-reload-server.mjs';

function request(url) {
  return { headers: { 'user-agent': 'Android WebView' }, url };
}

it('injects a build identity beacon and accepts only the matching load', () => {
  const loads = [];
  const plugin = createA5LiveReloadPlugin({ buildIdentity: 'dev-123', onDeviceLoad: (value) => loads.push(value) || true });
  const middlewares = { use: vi.fn() };
  plugin.configureServer({ middlewares });
  const tags = plugin.transformIndexHtml.handler();
  expect(tags).toContainEqual(expect.objectContaining({
    attrs: { content: 'dev-123', name: 'foliole-a5-dev-build' }, tag: 'meta'
  }));
  const handler = middlewares.use.mock.calls[0][0];
  const response = { end: vi.fn(), statusCode: 0 };
  handler(request('/__foliole_a5_dev_loaded__?identity=dev-123'), response, vi.fn());
  expect(response.statusCode).toBe(204);
  expect(loads).toHaveLength(1);
});

it('owns ready, reload, device identity, and cleanup in one foreground lifecycle', async () => {
  const runtime = new EventEmitter();
  const middlewares = { use: vi.fn() };
  const server = {
    close: vi.fn(async () => {}), listen: vi.fn(async () => {}), middlewares,
    ws: { send: vi.fn() }
  };
  const createServerImpl = vi.fn(async (config) => {
    runtime.plugin = config.plugins.at(-1);
    runtime.plugin.configureServer(server);
    return server;
  });
  const live = await startWindowsA5LiveReloadServer({
    buildIdentity: 'dev-456', createServerImpl, repoRoot: 'C:\\dev\\foliole'
  });
  expect(createServerImpl.mock.calls[0][0].server).toMatchObject({
    host: '127.0.0.1', port: WINDOWS_A5_LIVE_RELOAD_PORT, strictPort: true
  });
  const loaded = live.waitForDeviceLoad();
  middlewares.use.mock.calls[0][0](
    request('/__foliole_a5_dev_loaded__?identity=dev-456'), { end: vi.fn() }, vi.fn()
  );
  await expect(loaded).resolves.toMatchObject({ buildIdentity: 'dev-456', sequence: 1 });
  live.reload();
  expect(server.ws.send).toHaveBeenCalledWith({ path: '*', type: 'full-reload' });
  await live.close();
  expect(server.close).toHaveBeenCalledOnce();
});

it('closes a partially started server when readiness fails', async () => {
  const server = {
    close: vi.fn(async () => {}), listen: vi.fn(async () => { throw new Error('port busy'); }),
    middlewares: { use: vi.fn() }, ws: { send: vi.fn() }
  };
  await expect(startWindowsA5LiveReloadServer({
    buildIdentity: 'dev-789', createServerImpl: vi.fn(async () => server), repoRoot: 'C:\\repo'
  })).rejects.toMatchObject({ stage: 'live-server' });
  expect(server.close).toHaveBeenCalledOnce();
});
