// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { parseNodeResourceReferences } from '../../../../../lib/core/database/nodeResourceReferences';
import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { collectArticleImageStorageKeys } from '../../../../../lib/core/import/replaceArticleImageSource';
import { parseCanonicalAttachmentStorageKey } from '../../../../../lib/platform/attachmentResource';

import { readCompanionAttachmentReferences } from './companionAttachmentReferenceSnapshot';
import { createSearchLibrary } from './companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNodes } from './companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

// Bridge-volume checks for phone library reads: every native connection method call and its JSON bytes,
// counted at the Capacitor adapter boundary, never timed.
const meter = vi.hoisted(() => ({ on: false, calls: 0, resultBytes: 0 }));

vi.mock('../../companionSyncNodeVersionsTestSupport', async importOriginal => {
  const original = await importOriginal<typeof import('../../companionSyncNodeVersionsTestSupport')>();
  return { ...original, createFakeCapacitorConnection(db: Parameters<typeof original.createFakeCapacitorConnection>[0]) {
    const connection = original.createFakeCapacitorConnection(db) as Record<string, unknown>;
    for (const [method, invoke] of Object.entries(connection)) {
      if (typeof invoke !== 'function' || method === 'close') continue;
      connection[method] = async (...args: unknown[]) => {
        const result = await (invoke as (...values: unknown[]) => Promise<unknown>)(...args);
        if (meter.on) {
          meter.calls += 1;
          meter.resultBytes += Buffer.byteLength(JSON.stringify(result) ?? '');
        }
        return result;
      };
    }
    return connection;
  } };
});
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});

async function measure<T>(action: () => Promise<T>) {
  Object.assign(meter, { on: true, calls: 0, resultBytes: 0 });
  try { return { result: await action(), calls: meter.calls, resultBytes: meter.resultBytes }; }
  finally { meter.on = false; }
}

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; });

const key = (letter: string, type = 'png') => `${letter.repeat(64)}.${type}`;

/** The pre-change rule applied to every full body: what cleanup must keep regardless of transport. */
function expectedReferenceKeys() {
  const keys = new Set<string>();
  const add = (storageKey: string) => { if (parseCanonicalAttachmentStorageKey(storageKey)) keys.add(storageKey); };
  for (const row of library!.database.prepare('SELECT content, resource_references FROM nodes').all() as
    { content: string | null; resource_references: string }[]) {
    for (const reference of parseNodeResourceReferences(row.resource_references)) {
      if (reference.role === 'reference') add(reference.storage_key);
    }
    for (const storageKey of collectArticleImageStorageKeys(row.content ?? '')) add(storageKey);
  }
  for (const row of library!.database.prepare(`SELECT resource_references FROM node_text_alternatives
    WHERE status = 'available' AND node_id IN (SELECT id FROM nodes)`).all() as { resource_references: string }[]) {
    for (const reference of parseNodeResourceReferences(row.resource_references)) add(reference.storage_key);
  }
  return [...keys].sort();
}

function seedReferences() {
  const sql = library!.database;
  const update = sql.prepare('UPDATE nodes SET content = ? WHERE id = ?');
  update.run(`Intro\n\n![inline](asset://${key('a')})`, '000000');
  update.run(`![angle](<asset://${key('b', 'jpg')}>)`, '000001');
  update.run(`![ref][pic]\n\n[pic]: asset://${key('c')}`, '000002');
  update.run(`[plain link](asset://${key('d')}) and \`![code](asset://${key('e')})\``, '000003');
  update.run(`${'x'.repeat(4000)}\n\n![late](asset://${key('f')})`, '000004');
  sql.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?').run(JSON.stringify([
    { role: 'reference', storage_key: key('9', 'pdf'), original_name: 'Mounted.pdf' },
    { role: 'image', storage_key: key('8'), original_name: 'Detached.png' }
  ]), '000005');
  sql.prepare(`INSERT INTO node_text_alternatives (alternative_id, node_id, source_version_id, body_text,
    source_host_name, created_at, status, updated_at, resource_references)
    VALUES ('alt', '000006', 'v', '', 'Search', 'now', 'available', 'now', ?)`)
    .run(JSON.stringify([{ role: 'reference', storage_key: key('7', 'pdf'), original_name: 'Alt.pdf' }]));
}

it('reads manual cleanup references with the same result and a bounded bridge volume as the library grows', async () => {
  const counts: Record<number, { calls: number; resultBytes: number }> = {};
  for (const size of [200, 600]) {
    await library?.close();
    library = await createSearchLibrary(size, 1024);
    seedReferences();
    const expected = expectedReferenceKeys();
    expect(expected).toEqual([key('a'), key('b', 'jpg'), key('c'), key('f'), key('7', 'pdf'), key('9', 'pdf')].sort());
    const measured = await measure(() => readCompanionAttachmentReferences(getIosCompanionDatabaseOwner()));
    expect([...measured.result.storageKeys].sort()).toEqual(expected);
    counts[size] = { calls: measured.calls, resultBytes: measured.resultBytes };
  }
  // Before: 86 -> 236 calls and 232 KB -> 696 KB, because 16-node batches each reopened a snapshot and
  // every body crossed the bridge. Now only bodies that can hold a reference are read, so padding adds nothing.
  expect(counts[600]!.calls).toBe(counts[200]!.calls);
  expect(counts[600]!.calls).toBeLessThanOrEqual(16);
  expect(counts[600]!.resultBytes - counts[200]!.resultBytes).toBeLessThan(256);
  expect(counts[600]!.resultBytes).toBeLessThan(16 * 1024);
}, 120_000);

it('reads a restored subtree in one statement with the per-node results and order', async () => {
  library = await createSearchLibrary(200, 1024);
  const ids = [...Array.from({ length: 50 }, (_, index) => String(index * 3).padStart(6, '0')).reverse(), 'absent', '000003'];
  const expected = ids.flatMap(id => {
    const row = library!.database.prepare('SELECT n.* FROM nodes n WHERE n.id = ?').get(id) as WorkspaceNodeRowShape | undefined;
    return row ? [buildWorkspaceSnapshotNode(row)] : [];
  });
  const measured = await measure(() => loadCompanionWorkspaceNodes(ids));
  expect(measured.result).toEqual(expected);
  expect(measured.result).toHaveLength(51);
  // Before: 54 calls here (BEGIN, one SELECT per node, COMMIT, plus the adapter's open checks).
  expect(measured.calls).toBe(1);
});
