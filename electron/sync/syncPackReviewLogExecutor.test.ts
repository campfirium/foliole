import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackReviewLogWithDbPort } from '../../lib/core/sync/syncPackReviewLogExecutor.js';

it('applies incoming review log rows for existing nodes', async () => {
  const inserted: unknown[][] = [];
  const port = createReviewLogPort({ inserted });

  await expect(applySyncPackReviewLogWithDbPort(port, { incomingAlias: 'incoming' })).resolves.toEqual(['op-1']);
  expect(inserted).toHaveLength(1);
  expect(inserted[0]?.slice(0, 4)).toEqual(['review-1', 'op-1', 'Desktop host', 'node-1']);
});

it('confirms already existing review log rows', async () => {
  const port = createReviewLogPort({ existingOpIds: new Set(['op-1']), insertChanges: 0 });

  await expect(applySyncPackReviewLogWithDbPort(port, { incomingAlias: 'incoming' })).resolves.toEqual(['op-1']);
});

it('returns empty when the incoming pack has no review log table', async () => {
  const port = {
    query: vi.fn(async () => []),
    run: vi.fn(),
    transaction: vi.fn()
  } as unknown as DbPort;

  await expect(applySyncPackReviewLogWithDbPort(port, { incomingAlias: 'incoming' })).resolves.toEqual([]);
  expect(port.transaction).not.toHaveBeenCalled();
});

function createReviewLogPort(options: {
  existingOpIds?: Set<string>;
  insertChanges?: number;
  inserted?: unknown[][];
}) {
  const existingOpIds = options.existingOpIds ?? new Set<string>();
  const port = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('sqlite_master')) return [{ ok: 1 }];
      if (sql.includes('FROM incoming.review_log')) return [reviewLogRow()];
      if (sql.includes('FROM nodes')) return params[0] === 'node-1' ? [{ ok: 1 }] : [];
      if (sql.includes('FROM review_log')) return existingOpIds.has(String(params[0])) ? [reviewLogRow()] : [];
      return [];
    }),
    run: vi.fn(async (_sql: string, params: unknown[] = []) => {
      options.inserted?.push(params);
      return { changes: options.insertChanges ?? 1, lastInsertRowId: null };
    }),
    transaction: vi.fn(async (execute: (tx: DbPort) => Promise<unknown>) => await execute(port as unknown as DbPort))
  } as unknown as DbPort;
  return port;
}

function reviewLogRow() {
  return {
    host_name: 'Desktop host',
    difficulty_after: 4,
    difficulty_before: 3,
    due_after: '2026-05-06T00:00:00.000Z',
    due_before: '2026-05-05T00:00:00.000Z',
    grade: 3,
    id: 'review-1',
    node_id: 'node-1',
    op_id: 'op-1',
    reviewed_at: '2026-05-04T06:00:00.000Z',
    scheduler_version: 'fsrs',
    stability_after: 2,
    stability_before: 1
  };
}
