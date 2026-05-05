// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type { DatabaseBindParams, DatabaseDriver, DatabaseExecuteResult, DatabaseRow, DatabaseStatement } from '../../lib/core/database/driver.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/index.js';

const prepareSpy = vi.fn<(sql: string) => DatabaseStatement>();
const executeSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseExecuteResult>();
const queryOneSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseRow | undefined>();
const queryAllSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseRow[]>();

const driver: DatabaseDriver = {
  prepare: prepareSpy,
  execute: executeSpy,
  queryOne<T extends DatabaseRow = DatabaseRow>(sql: string, params?: DatabaseBindParams): T | undefined {
    return queryOneSpy(sql, params) as T | undefined;
  },
  queryAll<T extends DatabaseRow = DatabaseRow>(sql: string, params?: DatabaseBindParams): T[] {
    return queryAllSpy(sql, params) as T[];
  },
  transaction<T>(run: (innerDriver: DatabaseDriver) => T): T {
    return run(driver);
  }
};

const nodeRow = {
  parent_id: null,
  is_title_manual: 1,
  opening_text: null,
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
};

beforeEach(() => {
  prepareSpy.mockReset();
  executeSpy.mockReset();
  queryOneSpy.mockReset();
  queryAllSpy.mockReset();
});

it('prefers the persisted active node for full workspace snapshots', () => {
  queryAllSpy
    .mockReturnValueOnce([
      { ...nodeRow, id: 'node-1', title: 'Node 1' },
      { ...nodeRow, id: 'node-2', title: 'Node 2' }
    ])
    .mockReturnValueOnce([{ node_id: 'node-1' }, { node_id: 'node-2' }])
    .mockReturnValueOnce([]);
  queryOneSpy.mockReturnValueOnce({ value: '"desktop-test"' }).mockReturnValueOnce({ value: 'node-2' }).mockReturnValueOnce(undefined);

  expect(loadWorkspaceSnapshot(driver)?.activeNodeId).toBe('node-2');
});
