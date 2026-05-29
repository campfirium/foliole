// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type { DatabaseDriver, DatabaseStatement } from '../../lib/core/database/driver.js';
import {
  resetUpsertNodeSnapshotStatementCacheForTests,
  upsertNodeSnapshot
} from '../../lib/core/database/nodeMutations.js';

const prepareSpy = vi.fn<(sql: string) => DatabaseStatement>();

const driver: DatabaseDriver = {
  execute: vi.fn(() => ({ changes: 1, lastInsertRowId: 1 })),
  prepare: prepareSpy,
  queryAll: vi.fn(() => []),
  queryOne: vi.fn(() => undefined),
  transaction<T>(execute: (innerDriver: DatabaseDriver) => T): T {
    return execute(driver);
  }
};

const nodeInput = {
  anchorLink: null,
  content: 'Draft body',
  createdAt: '2026-03-14T00:00:00.000Z',
  isTitleManual: true,
  kind: 'topic' as const,
  nodeId: 'node-1',
  parentNodeId: null,
  position: 1,
  reveal: null,
  title: 'Node 1',
  updatedAt: '2026-03-14T00:00:00.000Z'
};

beforeEach(() => {
  resetUpsertNodeSnapshotStatementCacheForTests();
  vi.clearAllMocks();
  prepareSpy.mockImplementation((sql) => ({
    all: vi.fn(() => []),
    get: vi.fn(),
    run: vi.fn(() => ({ changes: 1, lastInsertRowId: 1 })),
    sql
  }));
});

it('reuses fixed node snapshot prepared statements for repeated saves on one driver', () => {
  upsertNodeSnapshot(driver, nodeInput, { searchInvalidation: { workspaceInvalidation: 'defer' } });
  upsertNodeSnapshot(driver, {
    ...nodeInput,
    content: 'Draft body updated',
    updatedAt: '2026-03-14T00:00:01.000Z'
  }, { searchInvalidation: { workspaceInvalidation: 'defer' } });

  expect(prepareSpy.mock.calls.filter(([sql]) => sql.includes('INSERT INTO nodes'))).toHaveLength(1);
  expect(prepareSpy.mock.calls.filter(([sql]) => sql.includes('INSERT INTO node_reading ('))).toHaveLength(1);
  expect(prepareSpy.mock.calls.filter(([sql]) => sql === 'DELETE FROM node_reading WHERE node_id = ?')).toHaveLength(1);
});
