// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type {
  DatabaseBindParams,
  DatabaseDriver,
  DatabaseRow,
  DatabaseStatement
} from '../../lib/core/database/driver.js';

const prepare = vi.fn<(sql: string) => DatabaseStatement>();
const queryOneSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseRow | undefined>();
const queryAllSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseRow[]>();
const transactionSpy = vi.fn();

const mockDriver: DatabaseDriver = {
  prepare,
  execute: vi.fn(),
  queryOne<T extends DatabaseRow = DatabaseRow>(sql: string, params?: DatabaseBindParams): T | undefined {
    return queryOneSpy(sql, params) as T | undefined;
  },
  queryAll<T extends DatabaseRow = DatabaseRow>(sql: string, params?: DatabaseBindParams): T[] {
    return queryAllSpy(sql, params) as T[];
  },
  transaction<T>(execute: (driver: DatabaseDriver) => T): T {
    transactionSpy(execute);
    return execute(mockDriver);
  }
};

vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({
    driver: mockDriver
  })
}));

vi.mock('./deviceIdentity.js', () => ({
  loadDesktopDeviceId: () => 'desktop-test',
  loadOrCreateDesktopDeviceId: () => 'desktop-test'
}));

import { loadReadingProgress, saveReadingProgress } from './readingProgress.js';

beforeEach(() => {
  prepare.mockReset();
  queryOneSpy.mockReset();
  queryAllSpy.mockReset();
  transactionSpy.mockClear();
});

it('saves reading progress through prepared driver statements only', () => {
  const metaRun = vi.fn();
  const nodeRun = vi.fn();

  prepare.mockImplementation((sql) => ({
    sql,
    run: sql.includes('workspace_meta') ? metaRun : nodeRun,
    get: vi.fn(),
    all: vi.fn()
  }));

  saveReadingProgress({
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 124,
        selectionFrom: 10,
        selectionTo: 18,
        updatedAt: '2026-03-14T00:00:00.000Z'
      }
    ],
    updatedAt: '2026-03-14T00:00:00.000Z'
  });

  expect(transactionSpy).toHaveBeenCalledTimes(1);
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(metaRun).toHaveBeenCalledWith(['active_node_id', 'node-2', '2026-03-14T00:00:00.000Z']);
  expect(nodeRun).toHaveBeenCalledWith([
    'node-1',
    'desktop-test',
    124,
    10,
    18,
    'user-scroll',
    '2026-03-14T00:00:00.000Z'
  ]);
});

it('loads reading progress through query helpers only', () => {
  queryOneSpy.mockImplementation((_sql, params) => ({
    value: params?.[0] === 'browse_root_node_id' ? 'node-root' : 'node-2'
  }));
  queryAllSpy.mockReturnValue([
    {
      node_id: 'node-1',
      scroll_top: 124,
      selection_from: 10,
      selection_to: 18,
      source: 'user-scroll',
      updated_at: '2026-03-14T00:00:00.000Z'
    }
  ]);

  expect(loadReadingProgress()).toEqual({
    activeNodeId: 'node-2',
    browseRootNodeId: 'node-root',
    nodeViewStateById: {
      'node-1': {
        scrollTop: 124,
        selectionFrom: 10,
        selectionTo: 18,
        source: 'user-scroll',
        updatedAt: '2026-03-14T00:00:00.000Z'
      }
    }
  });

  expect(queryOneSpy).toHaveBeenCalledWith('SELECT value FROM workspace_meta WHERE key = ?', [
    'active_node_id'
  ]);
  expect(queryOneSpy).toHaveBeenCalledWith('SELECT value FROM workspace_meta WHERE key = ?', [
    'browse_root_node_id'
  ]);
  expect(queryAllSpy).toHaveBeenCalledWith(
    `SELECT
       node_id,
       scroll_top,
       selection_from,
       selection_to,
       source,
       updated_at
     FROM node_view_state
     WHERE device_id = ?`,
    ['desktop-test']
  );
});
