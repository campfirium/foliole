import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort';

import { inspectCapacityWorkspace, prepareCapacityWorkspace } from './capacityWorkspaceFixture';

function port(rows: { inbox?: number; nodes?: Array<{ id: string; title: string }>; unexpected?: string;
  pdf?: Array<{ attachment_id: string | null; id: string; kind: string; parent_id: string | null; title: string }> }) {
  const run = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('NOT GLOB')) return rows.unexpected ? [{ id: rows.unexpected }] : [];
    if (sql.includes("id GLOB 'node-[0-9]*'")) return rows.nodes ?? [];
    if (sql.includes('LEFT JOIN node_attachments')) return rows.pdf ?? [];
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

it('accepts only the exact PDF sample beside the complete 10k fixture', async () => {
  const nodes = Array.from({ length: 10000 }, (_, index) => ({ id: `node-${index}`, title: `Topic ${index}` }));
  const pdf = { id: 'node-2701728c-a699-46fe-81df-681f70eb0244', title: 'working-set',
    kind: 'topic', parent_id: 'special-inbox',
    attachment_id: '436bf9594496c48a9952cccc8af5e3c480eaa534febc2d8b3aebb1469f55bad1' };
  await expect(inspectCapacityWorkspace(port({ nodes, pdf: [pdf] }))).resolves.toBe(10000);
  await expect(inspectCapacityWorkspace(port({ nodes: nodes.slice(0, 1000), pdf: [pdf] })))
    .rejects.toThrow('T234 PDF fixture mismatch');
  await expect(inspectCapacityWorkspace(port({ nodes, pdf: [{ ...pdf, attachment_id: 'wrong' }] })))
    .rejects.toThrow('T234 PDF fixture mismatch');
});

it('refuses skipped or repeated fixture transitions', async () => {
  const db = port({ nodes: [] });
  await expect(prepareCapacityWorkspace(db, 10000, 'A5')).rejects.toThrow('0 -> 10000');
  expect(db.run).not.toHaveBeenCalled();
});
