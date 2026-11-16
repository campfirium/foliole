// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { hashTextBody } from '../../../../../../lib/core/database/textBodyHash.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { beginSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

function observeBodyWrites() {
  const writes: { type: string; changes: number; versionId: unknown }[] = [];
  const wrap = (db: DbPort): DbPort => ({
    ...db,
    async run(sql, params) {
      const result = await db.run(sql, params);
      if (sql.startsWith('INSERT INTO node_sync_versions')) {
        writes.push({ type: 'insert', changes: result.changes, versionId: params?.[0] });
      } else if (/^UPDATE node_sync_versions SET body_text = \?|^UPDATE node_sync_versions\s+SET snapshot_json = json_set\(snapshot_json, '\$.body_blob_hash'/u.test(sql)) {
        writes.push({ type: 'repair', changes: result.changes, versionId: params?.at(-1) });
      }
      return result;
    },
    transaction: execute => db.transaction(tx => execute(wrap(tx)))
  });
  native.db = wrap(native.db!);
  return writes;
}

const nodeId = 'body-repair-topic';
const originalBody = 'Original body 中文';
const priorBody = 'Earlier history';
const editedBody = 'Edited body 🌿';

function storedVersions() {
  return host!.sqlite.prepare(`SELECT version_id AS versionId, body_text AS body,
    json_extract(snapshot_json, '$.body_blob_hash') AS hash,
    COALESCE(json_extract(snapshot_json, '$.body_deleted'), 0) AS retired
    FROM node_sync_versions WHERE object_id = ? ORDER BY created_at, version_id`).all(nodeId);
}

it.each(['first adoption', 'ordinary sync'])('receives complete versions without empty body writes during %s',
  { meta: { calibratedMs: 30000 } }, async mode => {
    host = await createCompanionRequestFixture();
    const { fixture } = host;
    if (mode === 'first adoption') await fixture.right.seed({ content: priorBody, nodeId, title: 'Topic' });
    await fixture.right.seed({ content: originalBody, nodeId, title: 'Topic' });
    if (mode === 'first adoption') {
      await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
        groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
        providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
    }
    const writes = observeBodyWrites();
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    const prior = mode === 'first adoption'
      ? [expect.objectContaining({ body: null, hash: hashTextBody(priorBody), retired: 1 })] : [];
    expect(storedVersions()).toEqual([
      ...prior, expect.objectContaining({ body: originalBody, hash: hashTextBody(originalBody), retired: 0 })
    ]);
    expect(writes).toContainEqual({ type: 'insert', changes: 1, versionId: expect.any(String) });
    expect.soft(writes.filter(write => write.type === 'repair' && !write.changes)).toEqual([]);

    writes.length = 0;
    await fixture.right.seed({ content: editedBody, nodeId, title: 'Topic' });
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    expect.soft(writes.filter(write => write.type === 'repair' && !write.changes)).toEqual([]);
    await host.restart();
    expect(storedVersions()).toEqual([
      ...prior, expect.objectContaining({ body: null, hash: hashTextBody(originalBody), retired: 1 }),
      expect.objectContaining({ body: editedBody, hash: hashTextBody(editedBody), retired: 0 })
    ]);
    expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe(editedBody);
  });
