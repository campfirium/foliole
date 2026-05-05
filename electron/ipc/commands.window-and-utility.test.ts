// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';

import { handleInvokeRequest } from './commands.js';

const { defaultReviewSchedulerSettings, openExternal, syncAppMenuState } = vi.hoisted(() => ({
  defaultReviewSchedulerSettings: {
    algorithm: 'ts-fsrs@4.3.0',
    desiredRetention: 0.9,
    maximumIntervalDays: 36500,
    enableFuzz: false,
    enableShortTerm: false,
    pushQueue: {
      defaultPriority: 5,
      priorityRatio: 5,
      queueMixRatio: { reading: 1, fsrs: 5 },
      readingInitialIntervalMs: 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.1, max: 1.5 }
    },
    updatedAt: '2026-03-06T00:00:00.000Z'
  },
  openExternal: vi.fn().mockResolvedValue(undefined),
  syncAppMenuState: vi.fn()
}));

const mockWindow = {
  close: vi.fn(),
  isMaximized: vi.fn(() => false),
  maximize: vi.fn(),
  minimize: vi.fn(),
  unmaximize: vi.fn()
};

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal }
}));
vi.mock('./menu.js', () => ({ syncAppMenuState }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn()
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn().mockResolvedValue({ 'foliole-ui-font-preset': 'inter' }),
  saveAppSettingsState: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings)
}));
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn().mockReturnValue({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} })
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockWindow.isMaximized.mockReturnValue(false);
});

it('handles typed native utility commands', async () => {
  const openExternalUrlRequest = {
    command: 'open_external_url',
    args: { url: 'https://example.com' }
  } satisfies NativeInvokeRequest<'open_external_url'>;
  const syncAppMenuStateRequest = {
    command: 'sync_app_menu_state',
    args: { enabledCommandIds: ['node.create', 'node.delete'] }
  } satisfies NativeInvokeRequest<'sync_app_menu_state'>;

  await expect(handleInvokeRequest(openExternalUrlRequest)).resolves.toBeNull();
  await expect(handleInvokeRequest(syncAppMenuStateRequest)).resolves.toBeNull();
  await expect(
    handleInvokeRequest({ command: 'app_get_version' } satisfies NativeInvokeRequest<'app_get_version'>)
  ).resolves.toBe('1.0.0');

  expect(openExternal).toHaveBeenCalledWith('https://example.com');
  expect(syncAppMenuState).toHaveBeenCalledWith(['node.create', 'node.delete']);
});

it('throws on unsupported command', async () => {
  await expect(handleInvokeRequest({ command: 'unknown.command' })).rejects.toThrow(
    'unsupported native command'
  );
});

it('handles window commands through invoke channel', async () => {
  await expect(handleInvokeRequest({ command: 'window_minimize' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_toggle_maximize' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_close' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_is_maximized' })).resolves.toBe(false);

  expect(mockWindow.minimize).toHaveBeenCalledTimes(1);
  expect(mockWindow.maximize).toHaveBeenCalledTimes(1);
  expect(mockWindow.close).toHaveBeenCalledTimes(1);
});

it('restores window when toggle command runs while maximized', async () => {
  mockWindow.isMaximized.mockReturnValue(true);

  await expect(handleInvokeRequest({ command: 'window_toggle_maximize' })).resolves.toBeNull();
  expect(mockWindow.unmaximize).toHaveBeenCalledTimes(1);
});
