// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';

vi.mock('electron', () => ({
  default: {
    app: { getVersion: () => '1.0.0' },
    shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
  }
}));

vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('./storage.js', () => ({
  clearWorkspaceState: vi.fn().mockResolvedValue(undefined),
  loadWorkspaceState: vi.fn().mockResolvedValue('{"state":1}'),
  saveWorkspaceState: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn().mockReturnValue({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} })
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('handles workspace storage commands', async () => {
  await expect(
    handleInvokeRequest({
      command: 'save_workspace_state',
      args: { storageKey: 'foliole-workspace-v1', payload: '{}' }
    })
  ).resolves.toBeNull();

  await expect(
    handleInvokeRequest({
      command: 'load_workspace_state',
      args: { storageKey: 'foliole-workspace-v1' }
    })
  ).resolves.toBe('{"state":1}');

  await expect(
    handleInvokeRequest({
      command: 'clear_workspace_state',
      args: { storageKey: 'foliole-workspace-v1' }
    })
  ).resolves.toBeNull();
});

it('handles app path and fsrs commands', async () => {
  await expect(handleInvokeRequest({ command: 'resolve_app_paths' })).resolves.toEqual({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  });

  await expect(
    handleInvokeRequest({
      command: 'review_grade',
      args: {
        request: {
          card: {
            due: '2026-03-04T00:00:00.000Z',
            last_review: null,
            state: 0,
            stability: 0,
            difficulty: 0,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0
          },
          rating: 'Good',
          now: '2026-03-04T00:00:00.000Z'
        }
      }
    })
  ).resolves.toEqual({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} });
});

it('throws on unsupported command', async () => {
  await expect(handleInvokeRequest({ command: 'unknown.command' })).rejects.toThrow(
    'unsupported native command'
  );
});
