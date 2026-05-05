// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type {
  DatabaseBindParams,
  DatabaseDriver,
  DatabaseExecuteResult,
  DatabaseRow,
  DatabaseStatement
} from '../../lib/core/database/driver.js';
import {
  applyReviewGrade,
  loadWorkspaceSnapshot,
  upsertNodeSnapshot
} from '../../lib/core/database/index.js';

const prepareSpy = vi.fn<(sql: string) => DatabaseStatement>();
const executeSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseExecuteResult>();
const queryOneSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseRow | undefined>();
const queryAllSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseRow[]>();
const transactionSpy = vi.fn();

const driver: DatabaseDriver = {
  prepare: prepareSpy,
  execute: executeSpy,
  queryOne<T extends DatabaseRow = DatabaseRow>(sql: string, params?: DatabaseBindParams): T | undefined {
    return queryOneSpy(sql, params) as T | undefined;
  },
  queryAll<T extends DatabaseRow = DatabaseRow>(sql: string, params?: DatabaseBindParams): T[] {
    return queryAllSpy(sql, params) as T[];
  },
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

beforeEach(() => {
  prepareSpy.mockReset();
  executeSpy.mockReset();
  queryOneSpy.mockReset();
  queryAllSpy.mockReset();
  transactionSpy.mockReset();
  reviewMutationContext.createId.mockReset();
  reviewMutationContext.createId.mockReturnValueOnce('op-1').mockReturnValueOnce('log-1');
});

it('writes node snapshot via driver transaction and prepared statements', () => {
  const upsertNodeRun = vi.fn();
  const upsertOrderRun = vi.fn();

  prepareSpy.mockImplementation((sql) => ({
    sql,
    run: sql.includes('INSERT INTO nodes') ? upsertNodeRun : upsertOrderRun,
    get: vi.fn(),
    all: vi.fn()
  }));

  upsertNodeSnapshot(driver, {
    nodeId: 'node-1',
    parentNodeId: null,
    title: 'Node 1',
    isTitleManual: true,
    content: '# Node 1',
    reveal: 'Answer',
    anchorLink: { id: 'anchor-1', kind: 'highlight' },
    position: 2,
    createdAt: '2026-03-14T00:00:00.000Z',
    updatedAt: '2026-03-14T00:00:00.000Z'
  });

  expect(transactionSpy).toHaveBeenCalledTimes(1);
  expect(prepareSpy).toHaveBeenCalledTimes(2);
  expect(upsertNodeRun).toHaveBeenCalledWith([
    'node-1',
    null,
    'Node 1',
    1,
    '# Node 1',
    'Answer',
    JSON.stringify({ id: 'anchor-1', kind: 'highlight' }),
    '2026-03-14T00:00:00.000Z',
    '2026-03-14T00:00:00.000Z'
  ]);
  expect(upsertOrderRun).toHaveBeenCalledWith(['node-1', 2]);
});

it('writes review mutation via driver contract with injected context', () => {
  const upsertReviewRun = vi.fn();
  const insertLogRun = vi.fn();

  prepareSpy.mockImplementation((sql) => ({
    sql,
    run: sql.includes('INSERT INTO node_review') ? upsertReviewRun : insertLogRun,
    get: vi.fn(),
    all: vi.fn()
  }));

  applyReviewGrade(driver, reviewMutationInput, reviewMutationContext);

  expect(transactionSpy).toHaveBeenCalledTimes(1);
  expect(upsertReviewRun).toHaveBeenCalledWith([
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
  ]);
  expect(insertLogRun).toHaveBeenCalledWith([
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
  ]);
});

it('loads workspace snapshot through query helpers only', () => {
  queryAllSpy
    .mockReturnValueOnce([
      {
        id: 'node-1',
        parent_id: null,
        title: 'Node 1',
        is_title_manual: 1,
        content: 'content',
        reveal: null,
        anchor_link: null,
        created_at: '2026-03-14T00:00:00.000Z',
        updated_at: '2026-03-14T00:00:00.000Z',
        deleted_at: null,
        review_due: null,
        review_last_review_at: null,
        review_state: null,
        review_stability: null,
        review_difficulty: null,
        review_elapsed_days: null,
        review_scheduled_days: null,
        review_reps: null,
        review_lapses: null
      }
    ])
    .mockReturnValueOnce([{ node_id: 'node-1' }]);

  expect(loadWorkspaceSnapshot(driver)).toEqual({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        id: 'node-1',
        parentNodeId: null,
        title: 'Node 1',
        isTitleManual: true,
        content: 'content',
        reveal: null,
        anchorLink: null,
        review: null,
        createdAt: '2026-03-14T00:00:00.000Z',
        updatedAt: '2026-03-14T00:00:00.000Z'
      }
    },
    trashedNodeIds: []
  });

  expect(queryAllSpy).toHaveBeenCalledTimes(2);
  expect(queryOneSpy).not.toHaveBeenCalled();
});
