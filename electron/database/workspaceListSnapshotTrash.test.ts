// @vitest-environment node

import { expect, it, vi } from 'vitest';

import type { DatabaseBindParams, DatabaseDriver, DatabaseExecuteResult, DatabaseRow } from '../../lib/core/database/driver.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/index.js';

const workspaceListRow = {
  id: 'node-trash',
  parent_id: null,
  priority: null,
  desired_retention: null,
  enable_short_term: null,
  sequential_reading_enabled: null,
  title: 'Deleted topic',
  is_title_manual: 1,
  hide_title_heading: 0,
  virtual_filter: null,
  opening_text: null,
  body_status: 'empty',
  has_content: 0,
  has_reveal: 0,
  anchor_link: null,
  image_regions: null,
  created_at: '2026-03-14T00:00:00.000Z',
  updated_at: '2026-03-14T00:10:00.000Z',
  deleted_at: '2026-03-14T00:10:00.000Z',
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

it('carries deleted node timestamps for runtime trash hydration', () => {
  const queryAll = vi.fn()
    .mockReturnValueOnce([workspaceListRow])
    .mockReturnValueOnce([])
    .mockReturnValueOnce([{ node_id: 'node-trash' }]);
  const queryOne = vi.fn()
    .mockReturnValueOnce({ value: '"desktop-test"' })
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce(undefined);
  const driver: DatabaseDriver = {
    prepare: vi.fn(),
    execute: vi.fn<(sql: string, params?: DatabaseBindParams) => DatabaseExecuteResult>(),
    queryAll: <T extends DatabaseRow = DatabaseRow>() => queryAll() as T[],
    queryOne: <T extends DatabaseRow = DatabaseRow>() => queryOne() as T | undefined,
    transaction: <T>(execute: (innerDriver: DatabaseDriver) => T) => execute(driver)
  };

  expect(loadWorkspaceListSnapshot(driver)).toMatchObject({
    nodeOrder: ['node-trash'],
    trashedNodeDeletedAtById: { 'node-trash': '2026-03-14T00:10:00.000Z' },
    trashedNodeIds: ['node-trash']
  });
});
