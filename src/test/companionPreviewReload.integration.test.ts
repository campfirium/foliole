// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createServer, type ViteDevServer } from 'vite';
import { afterEach, expect, it, vi } from 'vitest';

import { companionPreviewServerPlugin } from '../../scripts/vite/companionPreviewServer';

let server: ViteDevServer | undefined;
let root: string | undefined;
afterEach(async () => {
  await server?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

it('reloads the document for bootstrap dependencies but keeps UI updates hot', async () => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'companion-preview-hmr-')));
  const owner = path.join(root, 'src/shared/platform/owner.ts');
  const bootstrap = path.join(root, 'src/shared/platform/companionBootstrap.ts');
  mkdirSync(path.dirname(owner), { recursive: true });
  writeFileSync(owner, 'export const owner = {};');
  writeFileSync(bootstrap, "import { owner } from './owner'; export const boot = Promise.resolve(owner);");
  writeFileSync(path.join(root, 'main.js'), "import './src/shared/platform/companionBootstrap'; import './ui.js'; import './style.css'; if(import.meta.hot) import.meta.hot.accept();");
  writeFileSync(path.join(root, 'ui.js'), 'export const title = "preview"; if(import.meta.hot) import.meta.hot.accept();');
  writeFileSync(path.join(root, 'style.css'), 'body { color: black; }');
  server = await createServer({ configFile: false, root, server: { middlewareMode: true, watch: null },
    plugins: [companionPreviewServerPlugin(root, { FOLIOLE_COMPANION_PREVIEW_DB: path.join(root, 'preview.db') })] });
  for (const url of ['/main.js', '/src/shared/platform/companionBootstrap.ts', '/src/shared/platform/owner.ts', '/ui.js', '/style.css']) {
    await server.transformRequest(url);
  }
  const send = vi.spyOn(server.environments.client.hot, 'send');
  server.watcher.emit('change', owner);
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' })));
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'update' }));
  send.mockClear();
  server.watcher.emit('change', path.join(root, 'ui.js'));
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'update' })));
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }));
  send.mockClear();
  server.watcher.emit('change', path.join(root, 'style.css'));
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'update' })));
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }));
});

it('serves the stable shell while leaving the inner HTML and Vite inline modules executable', async () => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'companion-preview-shell-')));
  writeFileSync(path.join(root, 'index.html'), '<main>Reading</main><script type="module">document.body.dataset.executed = "yes";</script>');
  server = await createServer({ configFile: false, root, server: { host: '127.0.0.1', port: 0, watch: null },
    plugins: [companionPreviewServerPlugin(root, { FOLIOLE_COMPANION_PREVIEW_DB: path.join(root, 'preview.db') })] });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Missing preview address');
  const origin = `http://127.0.0.1:${address.port}`;
  expect(await (await fetch(origin)).text()).toContain('data-companion-preview-shell');
  const inner = await (await fetch(`${origin}/?__foliole_preview_frame=1`)).text();
  expect(inner).toContain('<main>Reading</main>');
  const proxy = inner.match(/src="([^"]*html-proxy[^"]*)"/u)?.[1];
  expect(proxy).toBeDefined();
  const module = await fetch(`${origin}${proxy}`);
  expect(module.headers.get('content-type')).toContain('javascript');
  expect(await module.text()).toContain('dataset.executed');
});
