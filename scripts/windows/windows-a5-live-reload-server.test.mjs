// @vitest-environment node

import { EventEmitter } from 'node:events';
import { Script } from 'node:vm';
import { expect, it, vi } from 'vitest';

import {
  createA5LiveReloadPlugin, startWindowsA5LiveReloadServer, WINDOWS_A5_LIVE_RELOAD_PORT
} from './windows-a5-live-reload-server.mjs';

function request(url) {
  return { headers: { 'user-agent': 'Android WebView' }, url };
}

it('injects a build identity beacon and accepts only the matching load', () => {
  const loads = [];
  const errors = [];
  const plugin = createA5LiveReloadPlugin({
    buildIdentity: 'dev-123', onDeviceError: (value) => errors.push(value) || true,
    onDeviceLoad: (value) => loads.push(value) || true
  });
  const middlewares = { use: vi.fn() };
  plugin.configureServer({ middlewares });
  const transformed = plugin.transformIndexHtml.handler(
    '<script type="module" src="/@vite/client"></script><main>Companion</main>'
  );
  const tags = transformed.tags;
  expect(transformed.html).toBe('<main>Companion</main>');
  expect(tags).toContainEqual(expect.objectContaining({
    attrs: { content: 'dev-123', name: 'foliole-a5-dev-build' }, tag: 'meta'
  }));
  const injectedScript = tags.find(({ tag }) => tag === 'script').children;
  expect(injectedScript).toContain('companion-bottom-tab-bar');
  expect(injectedScript).toContain('MutationObserver');
  expect(injectedScript).toContain('requestAnimationFrame(()=>requestAnimationFrame(report))');
  expect(injectedScript).toContain("addEventListener('unhandledrejection'");
  expect(injectedScript).toContain("event.filename||'unknown'");
  expect(injectedScript).toContain('reason&&reason.stack');
  expect(injectedScript).not.toContain('?.');
  expect(() => new Script(injectedScript)).not.toThrow();
  const handler = middlewares.use.mock.calls[0][0];
  const response = { end: vi.fn(), statusCode: 0 };
  handler(request('/__foliole_a5_dev_loaded__?identity=dev-123'), response, vi.fn());
  expect(response.statusCode).toBe(204);
  expect(loads).toHaveLength(1);
  handler(request('/__foliole_a5_dev_error__?identity=dev-123&message=parse'), response, vi.fn());
  expect(errors).toHaveLength(1);
});

it('includes a bounded WebView error in a visible readiness timeout', async () => {
  const middlewares = { use: vi.fn() };
  const server = { close: vi.fn(async () => {}), listen: vi.fn(async () => {}), middlewares };
  const live = await startWindowsA5LiveReloadServer({
    buildIdentity: 'dev-error', createServerImpl: vi.fn(async (config) => {
      config.plugins.at(-1).configureServer(server);
      return server;
    }), repoRoot: 'C:\\dev\\foliole', timeoutMs: 5
  });
  middlewares.use.mock.calls[0][0](
    request('/__foliole_a5_dev_error__?identity=dev-error&message=Unexpected%20token'),
    { end: vi.fn() }, vi.fn()
  );
  await expect(live.waitForDeviceLoad()).rejects.toThrow('Unexpected token');
  await live.close();
});

it('navigates only the fixed Appearance acceptance surface before reporting ready', () => {
  const plugin = createA5LiveReloadPlugin({
    buildIdentity: 'dev-appearance', onDeviceError: vi.fn(), onDeviceLoad: vi.fn(), surface: 'appearance'
  });
  const script = plugin.transformIndexHtml.handler('<main></main>').tags.at(-1).children;
  expect(script).toContain('companion-custom-css-settings');
  expect(script).toContain('companion-settings-appearance');
  expect(script).toContain('companion-tab-settings');
  expect(script).toContain('companion-top-bar-left-action');
  expect(script).toContain('companion-top-bar-back');
  expect(script.indexOf('companion-top-bar-back')).toBeLessThan(script.indexOf('companion-tab-settings'));
  expect(() => new Script(script)).not.toThrow();
});

it('owns compatible source transforms, device identity, and cleanup in one foreground lifecycle', async () => {
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
  expect(createServerImpl.mock.calls[0][0]).toMatchObject({
    oxc: { target: 'chrome64' },
    server: { hmr: false, host: '127.0.0.1', port: WINDOWS_A5_LIVE_RELOAD_PORT, strictPort: true }
  });
  const loaded = live.waitForDeviceLoad();
  middlewares.use.mock.calls[0][0](
    request('/__foliole_a5_dev_loaded__?identity=dev-456'), { end: vi.fn() }, vi.fn()
  );
  await expect(loaded).resolves.toMatchObject({ buildIdentity: 'dev-456', sequence: 1 });
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
