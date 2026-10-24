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
  writeFileSync(path.join(root, 'main.js'), "import './src/shared/platform/companionBootstrap'; import './ui.js'; if(import.meta.hot) import.meta.hot.accept();");
  writeFileSync(path.join(root, 'ui.js'), 'export const title = "preview"; if(import.meta.hot) import.meta.hot.accept();');
  server = await createServer({ configFile: false, root, server: { middlewareMode: true, watch: null },
    plugins: [companionPreviewServerPlugin(root, { FOLIOLE_COMPANION_PREVIEW_DB: path.join(root, 'preview.db') })] });
  for (const url of ['/main.js', '/src/shared/platform/companionBootstrap.ts', '/src/shared/platform/owner.ts', '/ui.js']) {
    await server.transformRequest(url);
  }
  const send = vi.spyOn(server.environments.client.hot, 'send');
  server.watcher.emit('change', owner);
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' })));
  expect(send.mock.calls.some(([message]) => typeof message === 'object' && message.type === 'update')).toBe(false);
  send.mockClear();
  server.watcher.emit('change', path.join(root, 'ui.js'));
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'update' })));
  expect(send.mock.calls.some(([message]) => typeof message === 'object' && message.type === 'full-reload')).toBe(false);
});
