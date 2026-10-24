// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { collectRequestSyncBodiesForNodes } from './requestSyncBodyRetention.js';
import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach(device => device.sqlite.close()));

function topic(nodeId: string, record: NativeSyncNodeRecord): NativeSyncNodeRecord {
  return { ...record, object_id: nodeId, version_id: `${nodeId}:${record.version_id}`,
    parent_version_id: record.parent_version_id ? `${nodeId}:${record.parent_version_id}` : null,
    parent_version_ids: record.parent_version_ids?.map(id => `${nodeId}:${id}`) ?? [],
    ancestor_version_ids: [...record.ancestor_version_ids].map(id => `${nodeId}:${id}`),
    snapshot: { ...record.snapshot, id: nodeId } };
}

async function historyDevice(nodeIds: readonly string[]) {
  const device = textDevice();
  devices.push(device);
  for (const nodeId of nodeIds) {
    const base = topic(nodeId, textBranch('base', `Original ${nodeId}`, undefined, '2026-10-24T00:00:00.000Z'));
    const head = topic(nodeId, textBranch('head', `Current ${nodeId}`, textBranch('base', `Original ${nodeId}`,
      undefined, '2026-10-24T00:00:00.000Z'), '2026-10-24T00:01:00.000Z'));
    await applyConvergentSyncNodesWithDbPort(device.db, [base, head], { collectVersionPayloads: false });
    device.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_remove(json_set(snapshot_json, '$.content', NULL), '$.body_blob_hash')
      WHERE version_id = ?`).run(`${nodeId}:base`);
    device.sqlite.prepare("INSERT INTO node_version_local_holds VALUES (?, ?, ?, 'now')").run(`editor-${nodeId}`, nodeId, `${nodeId}:base`);
  }
  return device;
}

const state = (device: ReturnType<typeof textDevice>) => ['node_sync_versions', 'node_sync_version_parents', 'nodes']
  .map(table => device.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all());

it('collects stored topic bodies for several nodes exactly as collecting them one by one', async () => {
  const nodeIds = ['topic-a', 'topic-b'];
  const single = await historyDevice(nodeIds);
  const batch = await historyDevice(nodeIds);
  for (const nodeId of nodeIds) {
    expect(await collectNodeVersionPayloads(single.db, nodeId, Number.MAX_SAFE_INTEGER)).toEqual({ released: 1, skipped: null });
  }
  await collectRequestSyncBodiesForNodes(batch.db, [...nodeIds, 'absent-node'], Number.MAX_SAFE_INTEGER);
  expect(state(batch)).toEqual(state(single));
  expect(batch.sqlite.prepare(`SELECT version_id FROM node_sync_versions
    WHERE json_extract(snapshot_json, '$.body_deleted') = 1 ORDER BY 1`).pluck().all()).toEqual(['topic-a:base', 'topic-b:base']);
});
