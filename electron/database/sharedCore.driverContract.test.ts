// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type {
  DatabaseBindParams,
  DatabaseDriver,
  DatabaseExecuteResult,
  DatabaseStatement
} from '../../lib/core/database/driver.js';
import { applyReviewGrade, upsertNodeSnapshot } from '../../lib/core/database/index.js';

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

const reviewMutationInput = {
  nodeId: 'node-1',
  grade: 3 as const,
  reviewedAt: '2026-03-14T00:00:00.000Z',
  cardBefore: {
    due: '2026-03-14T00:00:00.000Z',
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  },
  cardAfter: {
    due: '2026-03-18T00:00:00.000Z',
    last_review: '2026-03-14T00:00:00.000Z',
    state: 1 as const,
    stability: 2.5,
    difficulty: 3.1,
    elapsed_days: 1,
    scheduled_days: 4,
    reps: 1,
    lapses: 0
  }
};

const reviewMutationContext = {
  deviceId: 'desktop-local',
  schedulerVersion: 'ts-fsrs@4',
  createId: vi.fn().mockReturnValueOnce('op-1').mockReturnValueOnce('log-1')
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
  reviewMutationContext.createId.mockReset();
  reviewMutationContext.createId.mockReturnValueOnce('op-1').mockReturnValueOnce('log-1');
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
  if (sql.includes('INSERT INTO node_reading_device_state')) return runs.upsertReadingDeviceRun;
  if (sql.includes('INSERT INTO node_reading')) return runs.upsertReadingRun;
  if (sql === 'DELETE FROM node_reading WHERE node_id = ?') return runs.deleteReadingRun;
  if (sql === 'DELETE FROM node_reading_device_state WHERE node_id = ?') return runs.deleteReadingRun;
  if (sql === 'INSERT OR IGNORE INTO temp_workspace_search_seed_ids (id) VALUES (?)') return runs.insertSearchSeedRun;
  return vi.fn();
}

function mockNodeSnapshotStatements() {
  const runs = createStatementRuns();
  prepareSpy.mockImplementation((sql) => ({
    sql,
    run: resolveNodeSnapshotRunSpy(sql, runs),
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
    'Node 1',
    1,
    0,
    '# Node 1',
    expect.stringMatching(/^[a-f0-9]{64}$/),
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

function expectNodeSnapshotSearchSync(runs: ReturnType<typeof createStatementRuns>) {
  expect(runs.insertSearchSeedRun).toHaveBeenCalledWith(['node-1']);
  expect(executeSpy).toHaveBeenCalledWith(expect.stringContaining('CREATE TEMP TABLE IF NOT EXISTS temp_workspace_search_seed_ids'));
  expect(executeSpy).toHaveBeenCalledWith(expect.stringContaining('CREATE TEMP TABLE IF NOT EXISTS temp_workspace_search_affected_ids'));
  expect(executeSpy).toHaveBeenCalledWith('DELETE FROM temp_workspace_search_seed_ids');
  expect(executeSpy).toHaveBeenCalledWith('DELETE FROM temp_workspace_search_affected_ids');
  expect(executeSpy).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO temp_workspace_search_affected_ids'));
  expect(executeSpy).toHaveBeenCalledWith(
    'DELETE FROM node_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)'
  );
  expect(executeSpy).toHaveBeenCalledWith(
    'DELETE FROM pdf_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)'
  );
  expect(executeSpy).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO node_search'));
  expect(executeSpy).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO pdf_search'));
  expect(prepareSpy.mock.calls.map(([sql]) => sql)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('INSERT INTO nodes'),
      expect.stringContaining('INSERT INTO node_order'),
      expect.stringContaining('INSERT INTO node_reading'),
      expect.stringContaining('INSERT INTO node_reading_device_state'),
      'DELETE FROM node_reading WHERE node_id = ?',
      'DELETE FROM node_reading_device_state WHERE node_id = ?',
      'INSERT OR IGNORE INTO temp_workspace_search_seed_ids (id) VALUES (?)'
    ])
  );
}

it('writes node snapshot via driver transaction and prepared statements', () => {
  const runs = mockNodeSnapshotStatements();

  upsertNodeSnapshot(driver, nodeSnapshotInput);

  expect(transactionSpy).toHaveBeenCalledTimes(1);
  expect(prepareSpy).toHaveBeenCalledTimes(7);
  expect(driver.queryOne).toHaveBeenCalledWith('SELECT node_id FROM node_reading WHERE node_id = ?', ['node-1']);
  expect(driver.queryOne).toHaveBeenCalledWith('SELECT COUNT(*) AS count FROM temp_workspace_search_affected_ids');
  expectNodeSnapshotPersistence(runs);
  expectNodeSnapshotSearchSync(runs);
});

function mockReviewStatements() {
  const upsertReviewRun = vi.fn();
  const insertLogRun = vi.fn();
  prepareSpy.mockImplementation((sql) => ({
    sql,
    run: sql.includes('INSERT INTO node_review') ? upsertReviewRun : insertLogRun,
    get: vi.fn(),
    all: vi.fn()
  }));
  return { insertLogRun, upsertReviewRun };
}

const expectedReviewParams = [
  'node-1',
  '2026-03-18T00:00:00.000Z',
  '2026-03-14T00:00:00.000Z',
  1,
  2.5,
  3.1,
  1,
  4,
  1,
  0
] as const;

const expectedReviewLogParams = [
  'log-1',
  'op-1',
  'desktop-local',
  'node-1',
  3,
  'ts-fsrs@4',
  '2026-03-14T00:00:00.000Z',
  '2026-03-14T00:00:00.000Z',
  0,
  0,
  '2026-03-18T00:00:00.000Z',
  2.5,
  3.1
] as const;

function expectReviewPersistence(runs: ReturnType<typeof mockReviewStatements>) {
  expect(runs.upsertReviewRun).toHaveBeenCalledWith(expectedReviewParams);
  expect(runs.insertLogRun).toHaveBeenCalledWith(expectedReviewLogParams);
}

function expectReviewSyncWrites() {
  expect(executeSpy).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sync_object_state'), [
    'node_review',
    'node-1',
    null,
    expect.any(String),
    'desktop-local',
    '2026-03-14T00:00:00.000Z',
    null,
    1
  ]);
  expect(executeSpy).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sync_change_log'), expect.anything());
}

it('writes review mutation via driver contract with injected context', () => {
  const runs = mockReviewStatements();

  applyReviewGrade(driver, reviewMutationInput, reviewMutationContext);

  expect(transactionSpy).toHaveBeenCalledTimes(1);
  expectReviewPersistence(runs);
  expectReviewSyncWrites();
});
