// @vitest-environment node

import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: { getAppPath: vi.fn(() => '/repo') },
  existingPaths: new Set<string>()
}));

vi.mock('electron', () => ({ app: mocks.app }));
vi.mock('node:fs', () => ({
  existsSync: vi.fn((filePath: string) => mocks.existingPaths.has(path.normalize(filePath)))
}));

import { resolveGlobalCapturePreloadPath } from './globalCapturePreloadPath.js';

beforeEach(() => {
  mocks.app.getAppPath.mockReturnValue('/repo');
  mocks.existingPaths.clear();
});

it('uses the packaged app electron preload path when it exists', () => {
  const preloadPath = path.normalize('/repo/electron/globalCapturePanelPreload.cjs');
  mocks.existingPaths.add(preloadPath);

  expect(resolveGlobalCapturePreloadPath('globalCapturePanelPreload.cjs')).toBe(preloadPath);
});

it('falls back from the compiled dev app path to the source electron preload path', () => {
  mocks.app.getAppPath.mockReturnValue(path.normalize('/repo/dist/electron'));
  const preloadPath = path.normalize('/repo/electron/globalCapturePanelPreload.cjs');
  mocks.existingPaths.add(preloadPath);

  expect(resolveGlobalCapturePreloadPath('globalCapturePanelPreload.cjs')).toBe(preloadPath);
});
