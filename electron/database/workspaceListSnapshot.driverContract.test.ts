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
  virtual_filter: null,
  opening_text: 'The first body paragraph.',
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
      openingText: 'The first body paragraph.',
      content: '',
      virtualFilter: null,
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
  queryAllSpy.mockReturnValueOnce([workspaceListRow]).mockReturnValueOnce([]).mockReturnValueOnce([{ node_id: 'node-1' }]);
  queryOneSpy.mockReturnValueOnce({ value: '"desktop-test"' }).mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);

  expect(loadWorkspaceListSnapshot(driver)).toEqual(expectedWorkspaceListSnapshot);

  expect(queryAllSpy).toHaveBeenCalledTimes(3);
  expect(queryOneSpy).toHaveBeenCalledTimes(3);
});

it('queries lightweight list fields and reads opening_text instead of long-lived content bodies', () => {
  queryAllSpy.mockReturnValueOnce([workspaceListRow]).mockReturnValueOnce([]).mockReturnValueOnce([{ node_id: 'node-1' }]);
  queryOneSpy.mockReturnValueOnce({ value: '"desktop-test"' }).mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);

  loadWorkspaceListSnapshot(driver);

  const workspaceListSql = queryAllSpy.mock.calls[0]?.[0];
  expect(workspaceListSql).toContain('AS has_content');
  expect(workspaceListSql).toContain('n.body_blob_hash IS NOT NULL');
  expect(workspaceListSql).toContain('LENGTH(TRIM(n.content)) > 0');
  expect(workspaceListSql).toContain('AS has_reveal');
  expect(workspaceListSql).toContain('n.opening_text,');
  expect(workspaceListSql).not.toContain('content_blob_data');
  expect(workspaceListSql).toContain('node_reading_device_state');
  expect(workspaceListSql).not.toContain('n.reveal,');
  expect(workspaceListSql).not.toContain('n.content,');
});

it('prefers the persisted active node when it is still available', () => {
  queryAllSpy.mockReturnValueOnce([
    workspaceListRow,
    {
      ...workspaceListRow,
      id: 'node-2',
      title: 'Node 2'
    }
  ]).mockReturnValueOnce([]).mockReturnValueOnce([{ node_id: 'node-1' }, { node_id: 'node-2' }]);
  queryOneSpy
    .mockReturnValueOnce({ value: '"desktop-test"' })
    .mockReturnValueOnce({ value: 'node-2' })
    .mockReturnValueOnce(undefined);

  expect(loadWorkspaceListSnapshot(driver)?.activeNodeId).toBe('node-2');
});

it('uses indexed pdf text as the opening when the node body only contains the pdf placeholder', () => {
  queryAllSpy
    .mockReturnValueOnce([
      {
        ...workspaceListRow,
        opening_text: null,
        title: 'paper'
      }
    ])
    .mockReturnValueOnce([{ node_id: 'node-1', text: 'The actual PDF body starts here. More text follows.' }])
    .mockReturnValueOnce([{ node_id: 'node-1' }]);
  queryOneSpy.mockReturnValueOnce({ value: '"desktop-test"' }).mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);

  expect(loadWorkspaceListSnapshot(driver)?.nodesById['node-1']?.openingText).toBe('The actual PDF body starts here. More text follows.');
});

it('can skip pdf page opening backfill for lightweight startup snapshots', () => {
  queryAllSpy
    .mockReturnValueOnce([
      {
        ...workspaceListRow,
        opening_text: null,
        title: 'paper'
      }
    ])
    .mockReturnValueOnce([{ node_id: 'node-1' }]);
  queryOneSpy.mockReturnValueOnce({ value: '"desktop-test"' }).mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);

  expect(loadWorkspaceListSnapshot(driver, { includePdfOpenings: false })?.nodesById['node-1']?.openingText).toBeNull();
  expect(queryAllSpy).toHaveBeenCalledTimes(2);
});

it('falls back to the first nested child opening when the parent body is only a cover', () => {
  queryAllSpy
    .mockReturnValueOnce([
      {
        ...workspaceListRow,
        id: 'node-book',
        opening_text: null,
        title: 'Book Title',
      },
      {
        ...workspaceListRow,
        id: 'node-title-page',
        parent_id: 'node-book',
        opening_text: 'Book Title',
        title: 'Title Page',
      },
      {
        ...workspaceListRow,
        id: 'node-part',
        parent_id: 'node-book',
        opening_text: null,
        title: 'Part One',
      },
      {
        ...workspaceListRow,
        id: 'node-chapter',
        parent_id: 'node-part',
        opening_text: 'The first real chapter body.',
        title: 'Chapter 1',
      }
    ])
    .mockReturnValueOnce([])
    .mockReturnValueOnce([
      { node_id: 'node-book' },
      { node_id: 'node-title-page' },
      { node_id: 'node-part' },
      { node_id: 'node-chapter' }
    ]);
  queryOneSpy.mockReturnValueOnce({ value: '"desktop-test"' }).mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);

  const snapshot = loadWorkspaceListSnapshot(driver);
  expect(snapshot?.nodesById['node-book']?.openingText).toBe('The first real chapter body.');
  expect(snapshot?.nodesById['node-part']?.openingText).toBeNull();
  expect(snapshot?.nodesById['node-chapter']?.openingText).toBe('The first real chapter body.');
});
