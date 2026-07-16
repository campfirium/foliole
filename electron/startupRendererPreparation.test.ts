// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shouldUseDarkColors: false,
  tempRoots: [] as string[],
  writePrebuiltRendererHtmlForSettings: vi.fn()
}));

vi.mock('electron', () => ({
  nativeTheme: {
    get shouldUseDarkColors() {
      return mocks.shouldUseDarkColors;
    }
  }
}));

vi.mock('./runtimeRendererHtml.js', () => ({
  resolveRuntimeRendererIndexPath: (runtimeHtmlDir: string) => `${runtimeHtmlDir}/runtime-renderer-index.html`,
  writePrebuiltRendererHtmlForSettings: mocks.writePrebuiltRendererHtmlForSettings
}));

afterEach(async () => {
  mocks.shouldUseDarkColors = false;
  mocks.writePrebuiltRendererHtmlForSettings.mockClear();
  for (const tempRoot of mocks.tempRoots.splice(0)) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

async function createRuntimeHtmlDir(html: string) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-startup-renderer-'));
  mocks.tempRoots.push(tempRoot);
  await fs.writeFile(path.join(tempRoot, 'runtime-renderer-index.html'), html, 'utf8');
  return tempRoot;
}

it('uses the persisted startup document background during app startup without rebuilding html', async () => {
  const { prepareStartupRendererAppearance } = await import('./startupRendererPreparation.js');
  const runtimeHtmlDir = await createRuntimeHtmlDir(
    '<html style="--startup-region-main-document-bg: #ffffff;--startup-region-main-document-bg: #1b1d1d;--startup-app-display-scale-percent: 130;"></html>'
  );

  expect(prepareStartupRendererAppearance('/runtime', runtimeHtmlDir)).toEqual({
    backgroundColor: '#1b1d1d',
    displayScalePercent: 130
  });
  expect(mocks.writePrebuiltRendererHtmlForSettings).not.toHaveBeenCalled();
});

it('falls back to the Windows system dark background when startup html is unavailable', async () => {
  mocks.shouldUseDarkColors = true;
  const { prepareStartupRendererAppearance } = await import('./startupRendererPreparation.js');

  expect(prepareStartupRendererAppearance('/runtime', '/missing')).toEqual({
    backgroundColor: '#161918',
    displayScalePercent: 100
  });
});

it('prebuilds the startup renderer html only when settings are saved', async () => {
  const { writeStartupRendererHtml } = await import('./startupRendererPreparation.js');

  writeStartupRendererHtml('/runtime', { 'foliole-base-color': 'dark' }, '/userData');

  expect(mocks.writePrebuiltRendererHtmlForSettings).toHaveBeenCalledWith(
    '/runtime',
    { 'foliole-base-color': 'dark' },
    process.env.ELECTRON_RENDERER_URL ?? null,
    '/userData',
    'light'
  );
});

it('passes the Windows system dark mode into startup renderer html generation', async () => {
  mocks.shouldUseDarkColors = true;
  const { writeStartupRendererHtml } = await import('./startupRendererPreparation.js');

  writeStartupRendererHtml('/runtime', { 'foliole-base-color': 'system' }, '/userData');

  expect(mocks.writePrebuiltRendererHtmlForSettings).toHaveBeenCalledWith(
    '/runtime',
    { 'foliole-base-color': 'system' },
    process.env.ELECTRON_RENDERER_URL ?? null,
    '/userData',
    'dark'
  );
});
