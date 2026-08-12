// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type { DatabaseBindParams, DatabaseDriver, DatabaseExecuteResult, DatabaseRow } from '../../lib/core/database/driver.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/index.js';

const executeSpy = vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseExecuteResult>();
const prepareSpy = vi.fn();
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

const workspaceSnapshotRow = {
  id: 'node-1',
  import_content_fingerprint: 'content-1',
  import_source_fingerprint: 'source-1',
  parent_id: null,
  title: 'Node 1',
  is_title_manual: 1,
  opening_text: null,
  body_blob_hash: null,
  body_status: 'empty',
  content: '',
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

const expectedWorkspaceSnapshot = {
  activeNodeId: 'node-1',
  nodeOrder: ['node-1'],
  nodesById: {
    'node-1': {
      id: 'node-1',
      importContentFingerprint: 'content-1',
      importSourceFingerprint: 'source-1',
      parentNodeId: null,
      kind: 'topic',
      title: 'Node 1',
      isTitleManual: true,
      hideTitleHeading: false,
      attachments: [],
      bodyBlobHash: null,
      openingText: null,
      content: '',
      bodyStatus: 'empty',
      currentVersionId: null,
      virtualFilter: null,
      reveal: null,
      anchorLink: null,
      position: null,
      reading: null,
      review: null,
      shelvedAt: null,
      createdAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:00.000Z'
    }
  },
  trashedNodeDeletedAtById: {},
  trashedNodeIds: [],
  untitledSequenceByParent: {}
};

beforeEach(() => {
  executeSpy.mockReset();
  prepareSpy.mockReset();
  queryOneSpy.mockReset();
  queryAllSpy.mockReset();
  transactionSpy.mockReset();
});

it('loads workspace snapshot through query helpers only', () => {
  queryAllSpy.mockReturnValue([])
    .mockReturnValueOnce([workspaceSnapshotRow])
    .mockReturnValueOnce([{ node_id: 'node-1' }])
    .mockReturnValueOnce([])
    .mockReturnValueOnce([]);
  queryOneSpy.mockImplementation((sql) => {
    if (sql.includes('sync_group_local_state')) return undefined;
    if (sql.includes('settings WHERE key')) return { value: '"desktop-test"' };
    return undefined;
  });

  expect(loadWorkspaceSnapshot(driver)).toEqual(expectedWorkspaceSnapshot);

  expect(queryAllSpy).toHaveBeenCalled();
  expect(queryOneSpy).toHaveBeenCalled();
  expect(queryAllSpy.mock.calls[0]?.[0]).not.toContain('content_blob_data');
});

it('can opt in to full body content for internal snapshot callers', () => {
  queryAllSpy.mockReturnValueOnce([]);
  queryOneSpy.mockReturnValueOnce({ value: '"desktop-test"' });

  expect(loadWorkspaceSnapshot(driver, { includeBody: true })).toBeNull();

  expect(queryAllSpy.mock.calls[0]?.[0]).toContain('content_blob_data');
});
