// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import {
  deleteNodesPermanently,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from '../database/nodeMutations.js';

import { handleInvokeRequest } from './commands.js';

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
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
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
vi.mock('../database/workspaceState.js', () => ({
  clearWorkspaceStateFromSqlite: vi.fn(),
  loadWorkspaceStateFromSqlite: vi.fn().mockReturnValue('{"state":1}'),
  saveWorkspaceStateToSqlite: vi.fn()
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
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn().mockReturnValue({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} })
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockWindow.isMaximized.mockReturnValue(false);
});

it('handles workspace state storage commands', async () => {
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

it('handles node mutation commands', async () => {
  await expect(
    handleInvokeRequest({
      command: 'update_node_content',
      args: {
        nodeId: 'node-1',
        parentNodeId: null,
        title: 'Node title',
        isTitleManual: false,
        content: '# Content',
        reveal: null,
        anchorLink: null,
        position: 1,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:01.000Z'
      }
    })
  ).resolves.toBeNull();

  expect(upsertNodeSnapshot).toHaveBeenNthCalledWith(1, {
    nodeId: 'node-1',
    parentNodeId: null,
    title: 'Node title',
    isTitleManual: false,
    content: '# Content',
    reveal: null,
    anchorLink: null,
    position: 1,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  });

});

it('handles node reveal mutation command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'update_node_reveal',
      args: {
        nodeId: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA',
        isTitleManual: true,
        content: 'Question',
        reveal: 'Answer',
        anchorLink: { id: 'cloze-1', kind: 'cloze' },
        position: 2,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:02.000Z'
      }
    })
  ).resolves.toBeNull();

  expect(upsertNodeSnapshot).toHaveBeenCalledWith({
    nodeId: 'node-2',
    parentNodeId: 'node-1',
    title: 'QA',
    isTitleManual: true,
    content: 'Question',
    reveal: 'Answer',
    anchorLink: { id: 'cloze-1', kind: 'cloze' },
    position: 2,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:02.000Z'
  });

});

it('handles node order replacement command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'replace_node_order',
      args: { nodeIds: ['node-1', 'node-2'] }
    })
  ).resolves.toBeNull();
  expect(replaceNodeOrder).toHaveBeenCalledWith(['node-1', 'node-2']);
});

it('handles soft delete node command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'soft_delete_nodes',
      args: {
        nodeIds: ['node-1', 'node-2'],
        deletedAt: '2026-03-06T00:00:00.000Z'
      }
    })
  ).resolves.toBeNull();

  expect(softDeleteNodes).toHaveBeenCalledWith({
    nodeIds: ['node-1', 'node-2'],
    deletedAt: '2026-03-06T00:00:00.000Z'
  });
});

it('handles restore node command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'restore_nodes',
      args: {
        nodeIds: ['node-1']
      }
    })
  ).resolves.toBeNull();

  expect(restoreNodes).toHaveBeenCalledWith({
    nodeIds: ['node-1']
  });
});

it('handles permanent delete node command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'delete_nodes_permanently',
      args: {
        nodeIds: ['node-3'],
        nodeOrder: ['node-1', 'node-2']
      }
    })
  ).resolves.toBeNull();

  expect(deleteNodesPermanently).toHaveBeenCalledWith({
    nodeIds: ['node-3'],
    nodeOrder: ['node-1', 'node-2']
  });
});

it('handles app settings storage commands', async () => {
  await expect(handleInvokeRequest({ command: 'load_app_settings_state' })).resolves.toEqual({
    'foliole-ui-font-preset': 'inter'
  });

  await expect(
    handleInvokeRequest({
      command: 'save_app_settings_state',
      args: {
        settings: {
          'foliole-ui-font-preset': 'source-sans'
        }
      }
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
