// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { FORMED_AT, branches, nodeMetadata, referencedNode } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../database/bodyContentOwnerMigration.js';

import type { DbPort, DbRow } from './dbPort.js';
import { projectFramedSyncNodeRecord } from './framedSyncNodeProjection.js';
import { restoreFramedSyncNodeRecord } from './framedSyncNodeRestore.js';
import { applyVerifiedFramedFactUnit, applyVerifiedFramedFactUnits } from './framedSyncVerifiedFactApply.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';
import { loadCurrentVerifiedSyncNode } from './syncNodeVerifiedGraph.js';
import { readBodyText } from './verifiedBody.js';

afterEach(() => vi.useRealTimers());

function noBodyReads(db: DbPort): DbPort {
  const observe = (source: DbPort): DbPort => ({ ...source,
    async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) {
      const rows = await source.query<T>(sql, params);
      for (const row of rows) for (const value of Object.values(row)) {
        if (value instanceof Uint8Array && value.byteLength > 32) throw new Error('body_read_during_unit_apply');
      }
      return rows;
    }, transaction: (run) => source.transaction((tx) => run(observe(tx))) });
  return observe(db);
}

it.each(['direct', 'restore', 'concurrent'] as const)('applies the original %s framed business unit without loading its body', async (scenario) => {
  vi.useFakeTimers(); vi.setSystemTime(FORMED_AT);
  const { base, local, incoming } = branches('Start\n' + '\ufeff中😀\0文'.repeat(300000), 'Remote');
  const old = textDevice(); const host = textDevice();
  try {
    await old.receive([base]); await host.receive([base]);
    if (scenario === 'concurrent') { await old.receive([local]); await host.receive([local]); }
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx); await migrateBodyContentOwners(tx, 'desktop');
    });
    const record = scenario === 'concurrent' ? incoming : local;
    await referencedNode(host.db, record);
    const projected = projectFramedSyncNodeRecord(record);
    const fact = projected.manifest.facts[0]!;
    const restored = restoreFramedSyncNodeRecord({ bodyBlob: projected.bodyBlob,
      fact, manifestBlob: fact.blobs[0]! });
    if (scenario === 'restore') await applySyncNodesWithDbPort(old.db, [restored], { operation: 'local_restore' });
    else await old.receive([restored]);
    const actual = await applyVerifiedFramedFactUnit(scenario === 'concurrent' ? host.db : noBodyReads(host.db), [fact],
      scenario === 'restore' ? { operation: 'local_restore' } : {});
    expect(actual).toMatchObject({ globalId: 'topic', objectType: 'node', generatedChanges: scenario === 'concurrent' });
    const current = await loadCurrentVerifiedSyncNode(host.db, 'topic');
    const expected = await loadCurrentSyncNodeRecord(old.db, 'topic');
    expect(current?.metadata).toEqual(nodeMetadata(expected!));
    if (current?.body.kind !== 'readable') throw new Error('readable_result_required');
    expect(await readBodyText(host.db, current.body.ref)).toBe(expected?.body_text);
  } finally { old.sqlite.close(); host.sqlite.close(); }
});

it('rejects mixed business units before any business state becomes visible', async () => {
  const host = textDevice();
  try {
    const { base } = branches('Local', 'Remote');
    const fact = projectFramedSyncNodeRecord(base).manifest.facts[0]!;
    await expect(applyVerifiedFramedFactUnit(host.db, [fact, { ...fact, globalId: 'other' }]))
      .rejects.toThrow('framed_sync_process_fact_set_invalid');
    expect(host.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});

it('restores child-first business units atomically using the original cross-unit dependency order', async () => {
  const host = textDevice(); const old = textDevice();
  try {
    const { base } = branches('Child', 'Remote');
    const parent = { ...base, object_id: 'parent', version_id: 'parent-version',
      snapshot: { ...base.snapshot, id: 'parent', kind: 'folder', content: '', parent_id: null }, body_text: '' };
    const child = { ...base, snapshot: { ...base.snapshot, parent_id: 'parent' } };
    const records = [child, parent];
    const projections = records.map((record) => projectFramedSyncNodeRecord(record));
    const restored = projections.map((projection) => restoreFramedSyncNodeRecord({
      fact: projection.manifest.facts[0]!, manifestBlob: projection.manifest.blobs[0]!, bodyBlob: projection.bodyBlob }));
    await applySyncNodesWithDbPort(old.db, restored, { operation: 'local_restore' });
    await host.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx); await migrateBodyContentOwners(tx, 'desktop');
    });
    for (const record of records) await referencedNode(host.db, record);
    await applyVerifiedFramedFactUnits(noBodyReads(host.db), projections.map((projection) => projection.manifest.facts),
      { operation: 'local_restore' });
    for (const record of records) {
      expect((await loadCurrentVerifiedSyncNode(host.db, record.object_id))?.metadata)
        .toEqual(nodeMetadata((await loadCurrentSyncNodeRecord(old.db, record.object_id))!));
    }
  } finally { host.sqlite.close(); old.sqlite.close(); }
});
