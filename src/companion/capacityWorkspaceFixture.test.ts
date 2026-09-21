import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort';

import { inspectCapacityWorkspace, prepareCapacityWorkspace } from './capacityWorkspaceFixture';

function port(rows: { inbox?: number; nodes?: Array<{ id: string; title: string }>; unexpected?: string }) {
  const run = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('NOT GLOB')) return rows.unexpected ? [{ id: rows.unexpected }] : [];
    if (sql.includes("id GLOB 'node-[0-9]*'")) return rows.nodes ?? [];
    if (sql.includes('COUNT(*)')) return [{ count: rows.inbox ?? 1 }];
    return [];
  });
  return { query, run, transaction: vi.fn() } as unknown as DbPort;
}

it('accepts only the fixed normal-workspace stages', async () => {
  const nodes = Array.from({ length: 1000 }, (_, index) => ({ id: `node-${index}`, title: `Topic ${index}` }));
  await expect(inspectCapacityWorkspace(port({ nodes }))).resolves.toBe(1000);
});

it('refuses unrelated acceptance-container content before writing', async () => {
  const db = port({ unexpected: 'other-test-topic' });
  await expect(inspectCapacityWorkspace(db)).rejects.toThrow('non-T219');
  expect(db.run).not.toHaveBeenCalled();
});

it('refuses skipped or repeated fixture transitions', async () => {
  const db = port({ nodes: [] });
  await expect(prepareCapacityWorkspace(db, 10000, 'A5')).rejects.toThrow('0 -> 10000');
  expect(db.run).not.toHaveBeenCalled();
});
