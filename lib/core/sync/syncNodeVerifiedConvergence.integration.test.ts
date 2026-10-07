// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { FORMED_AT, branches, nodeMetadata, observeReads, referencedNode } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../database/bodyContentOwnerMigration.js';

import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';
import { applyConvergentVerifiedSyncNodesWithDbPort } from './syncNodeVerifiedConvergence.js';
import { loadCurrentVerifiedSyncNode } from './syncNodeVerifiedGraph.js';
import { loadTopicTextBodies } from './topicTextBodies.js';
import { readBodyText } from './verifiedBody.js';

afterEach(() => vi.useRealTimers());

it.each(['forward', 'concurrent', 'empty', 'large', 'replay'] as const)(
  'preserves the complete %s convergence result through stable references', async (scenario) => {
    vi.useFakeTimers(); vi.setSystemTime(FORMED_AT);
    const body = scenario === 'empty' ? '' : scenario === 'large' ? '\ufeff中😀\0文'.repeat(300000) : 'Local longer version';
    const { base, local, incoming } = branches(body, 'Remote');
    const old = textDevice();
    const stable = textDevice();
    try {
      await stable.db.transaction(async (tx) => {
        await migrateBodyContentStorage(tx);
        await migrateBodyContentOwners(tx, 'desktop');
      });
      const rounds = [[base], [local], scenario === 'forward'
        ? [textBranch('next', 'New main', local, '2026-10-07T03:00:00.000Z')] : [incoming]];
      if (scenario === 'replay') rounds.push([incoming], [base]);
      const reads = observeReads(stable.db);
      for (const records of rounds) {
        const expected = await applyConvergentSyncNodesWithDbPort(old.db, records);
        const refs = [];
        for (const record of records) refs.push(await referencedNode(stable.db, record));
        expect(await applyConvergentVerifiedSyncNodesWithDbPort(reads.port, refs)).toEqual(expected);
        const current = await loadCurrentVerifiedSyncNode(reads.port, 'topic');
        const original = await loadCurrentSyncNodeRecord(old.db, 'topic');
        expect(current?.metadata).toEqual(nodeMetadata(original!));
        if (current?.body.kind !== 'readable') throw new Error('readable_result_required');
        expect(await readBodyText(stable.db, current.body.ref)).toBe(original?.body_text);
        expect(current.alternativeBodies.map((ref) => ref.hash).sort())
          .toEqual((await loadTopicTextBodies(old.db, original!)).map((entry) => entry.hash).sort());
      }
      expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
      expect(stable.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
      expect(stable.sqlite.prepare("SELECT count(*) FROM search_index_invalidations WHERE target_id = 'topic'").pluck().get()).toBeGreaterThan(0);
    } finally { old.sqlite.close(); stable.sqlite.close(); }
  });

it('rolls back all node units and queued indexing when the last unit fails, then retries', async () => {
  const host = textDevice();
  try {
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx);
      await migrateBodyContentOwners(tx, 'desktop');
    });
    const records = [textBranch('first', 'First'), textBranch('last', 'Last')];
    records[1]!.object_id = 'second'; records[1]!.snapshot.id = 'second';
    const refs = [];
    for (const record of records) refs.push(await referencedNode(host.db, record));
    host.sqlite.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON nodes WHEN NEW.id = 'second'
      BEGIN SELECT RAISE(ABORT, 'second_unavailable'); END`);
    await expect(applyConvergentVerifiedSyncNodesWithDbPort(host.db, refs)).rejects.toThrow('second_unavailable');
    for (const table of ['nodes', 'node_sync_versions', 'sync_object_state', 'search_index_invalidations', 'content_blobs']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    host.sqlite.exec('DROP TRIGGER reject_second');
    expect((await applyConvergentVerifiedSyncNodesWithDbPort(host.db, refs)).appliedNodeCount).toBe(2);
  } finally { host.sqlite.close(); }
});
