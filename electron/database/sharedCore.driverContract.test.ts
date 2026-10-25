// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type {
  DatabaseBindParams,
  DatabaseDriver,
  DatabaseExecuteResult,
  DatabaseStatement
} from '../../lib/core/database/driver.js';
import { upsertNodeSnapshot } from '../../lib/core/database/index.js';

const prepareSpy = vi.fn<(sql: string) => DatabaseStatement>();
const executeSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseExecuteResult>();
const transactionSpy = vi.fn();

const driver: DatabaseDriver = {
  prepare: prepareSpy,
  execute: executeSpy,
  queryOne: vi.fn(),
  queryAll: vi.fn(),
  transaction<T>(execute: (innerDriver: DatabaseDriver) => T): T {
    transactionSpy(execute);
    return execute(driver);
  }
};

const nodeSnapshotInput = {
  nodeId: 'node-1',
  parentNodeId: null,
  kind: 'item' as const,
  title: 'Node 1',
  isTitleManual: true,
  content: '# Node 1',
  reveal: 'Answer',
  anchorLink: { id: 'anchor-1', kind: 'highlight' as const },
  reading: {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: '2026-03-14T00:00:00.000Z',
    nextAt: '2026-03-14T00:00:00.000Z',
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state: 'dismissed' as const
  },
  position: 2,
  createdAt: '2026-03-14T00:00:00.000Z',
  updatedAt: '2026-03-14T00:00:00.000Z'
};

beforeEach(() => {
  prepareSpy.mockReset();
  executeSpy.mockReset();
  transactionSpy.mockReset();
  vi.mocked(driver.queryOne).mockReset();
  vi.mocked(driver.queryOne).mockImplementation((sql) => {
    if (sql === 'SELECT COUNT(*) AS count FROM temp_workspace_search_affected_ids') {
      return { count: 1 };
    }
    return undefined;
  });
  vi.mocked(driver.queryAll).mockReset();
  vi.mocked(driver.queryAll).mockReturnValue([]);
});

function createStatementRuns() {
  return {
    deleteReadingRun: vi.fn(),
    insertSearchSeedRun: vi.fn(),
    upsertNodeRun: vi.fn(),
    upsertOrderRun: vi.fn(),
    upsertReadingDeviceRun: vi.fn(),
    upsertReadingRun: vi.fn()
  };
}

function resolveNodeSnapshotRunSpy(sql: string, runs: ReturnType<typeof createStatementRuns>) {
  if (sql.includes('INSERT INTO nodes')) return runs.upsertNodeRun;
  if (sql.includes('INSERT INTO node_order')) return runs.upsertOrderRun;
  if (sql.includes('INSERT INTO node_reading_host_state')) return runs.upsertReadingDeviceRun;
  if (sql.includes('INSERT INTO node_reading')) return runs.upsertReadingRun;
  if (sql === 'DELETE FROM node_reading WHERE node_id = ?') return runs.deleteReadingRun;
  if (sql === 'DELETE FROM node_reading_host_state WHERE node_id = ?') return runs.deleteReadingRun;
  if (sql === 'INSERT OR IGNORE INTO temp_workspace_search_seed_ids (id) VALUES (?)') return runs.insertSearchSeedRun;
  return vi.fn();
}

function mockNodeSnapshotStatements() {
  const runs = createStatementRuns();
  prepareSpy.mockImplementation((sql) => ({
    sql,
    run: sql.includes('search_index_invalidations')
      ? vi.fn(() => ({ changes: 0, lastInsertRowid: 0 }))
      : resolveNodeSnapshotRunSpy(sql, runs),
    get: vi.fn(),
    all: vi.fn()
  }));
  return runs;
}

function expectNodeSnapshotPersistence(runs: ReturnType<typeof createStatementRuns>) {
  expect(runs.upsertNodeRun).toHaveBeenCalledWith([
    'node-1',
    null,
    'item',
    null,
    null,
    null,
    null,
    null,
    null,
    'Node 1',
    1,
    0,
    '# Node 1',
    'a967b9ba630730788949301bdf9d69edcf76fa157f72ebd013067fca71dd79e6',
    null,
    null,
    'Answer',
    JSON.stringify({ id: 'anchor-1', kind: 'highlight' }),
    null,
    null,
    null,
    '2026-03-14T00:00:00.000Z',
    '2026-03-14T00:00:00.000Z'
  ]);
  expect(runs.upsertOrderRun).not.toHaveBeenCalled();
  expect(runs.upsertReadingRun).toHaveBeenCalledWith([
    'node-1',
    0,
    1,
    '2026-03-14T00:00:00.000Z',
    '2026-03-14T00:00:00.000Z',
    0,
    0,
    'dismissed'
  ]);
  expect(runs.upsertReadingDeviceRun).not.toHaveBeenCalled();
  expect(runs.deleteReadingRun).not.toHaveBeenCalled();
}

function expectNodeSnapshotSearchSync() {
  expect(prepareSpy.mock.calls.map(([sql]) => sql)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('INSERT INTO nodes'),
      expect.stringContaining('INSERT INTO node_reading'),
      expect.stringContaining('INSERT INTO node_reading_host_state'),
      expect.stringContaining('DELETE FROM search_index_invalidations'),
      expect.stringContaining('INSERT INTO search_index_invalidations'),
      'DELETE FROM node_reading WHERE node_id = ?',
      'DELETE FROM node_reading_host_state WHERE node_id = ?',
    ])
  );
}

it('writes node snapshot via driver transaction and prepared statements', () => {
  const runs = mockNodeSnapshotStatements();

  upsertNodeSnapshot(driver, nodeSnapshotInput);

  expect(transactionSpy).toHaveBeenCalled();
  expect(driver.queryOne).toHaveBeenCalledWith('SELECT node_id FROM node_reading WHERE node_id = ?', ['node-1']);
  expectNodeSnapshotPersistence(runs);
  expectNodeSnapshotSearchSync();
});
