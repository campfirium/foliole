// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type { DatabaseBindParams, DatabaseDriver, DatabaseExecuteResult, DatabaseRow, DatabaseStatement } from '../../lib/core/database/driver.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/index.js';

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

const workspaceListRow = {
  id: 'node-1',
  parent_id: null,
  priority: null,
  desired_retention: null,
  title: 'Node 1',
  is_title_manual: 1,
  hide_title_heading: 1,
  has_content: 1,
  has_reveal: 1,
  anchor_link: null,
  created_at: '2026-03-14T00:00:00.000Z',
  updated_at: '2026-03-14T00:00:00.000Z',
  deleted_at: null,
  reading_interval_duration_ms: null,
  reading_interval_growth_factor: null,
  reading_last_handled_at: null,
  reading_next_at: null,
  reading_priority: null,
  reading_position: null,
  reading_repetition_count: null,
  reading_state: null,
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

const expectedWorkspaceListSnapshot = {
  activeNodeId: 'node-1',
  nodeOrder: ['node-1'],
  nodesById: {
    'node-1': {
      id: 'node-1',
      parentNodeId: null,
      kind: 'topic',
      priority: null,
      desiredRetention: null,
      title: 'Node 1',
      isTitleManual: true,
      hideTitleHeading: true,
      hasContent: true,
      hasReveal: true,
      content: '',
      reveal: null,
      anchorLink: null,
      reading: null,
      review: null,
      createdAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:00.000Z'
    }
  },
  trashedNodeIds: [],
  untitledSequenceByParent: {}
};

beforeEach(() => {
  prepareSpy.mockReset();
  executeSpy.mockReset();
  queryOneSpy.mockReset();
  queryAllSpy.mockReset();
  transactionSpy.mockReset();
});

it('loads workspace list snapshot without long-lived node documents', () => {
  queryAllSpy.mockReturnValueOnce([workspaceListRow]).mockReturnValueOnce([{ node_id: 'node-1' }]);
  queryOneSpy.mockReturnValueOnce(undefined);

  expect(loadWorkspaceListSnapshot(driver)).toEqual(expectedWorkspaceListSnapshot);

  expect(queryAllSpy).toHaveBeenCalledTimes(2);
  expect(queryOneSpy).toHaveBeenCalledTimes(1);
});

it('queries lightweight content flags instead of full node documents', () => {
  queryAllSpy.mockReturnValueOnce([workspaceListRow]).mockReturnValueOnce([{ node_id: 'node-1' }]);
  queryOneSpy.mockReturnValueOnce(undefined);

  loadWorkspaceListSnapshot(driver);

  const workspaceListSql = queryAllSpy.mock.calls[0]?.[0];
  expect(workspaceListSql).toContain('AS has_content');
  expect(workspaceListSql).toContain('AS has_reveal');
  expect(workspaceListSql).not.toContain('n.content,');
  expect(workspaceListSql).not.toContain('n.reveal,');
});
