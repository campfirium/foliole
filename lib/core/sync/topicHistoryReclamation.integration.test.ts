// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice, wholeBodies } from '../../../electron/database/topicTextState.testSupport.js';

import { applyLocalContentEdit } from './localContentEdit.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { requestSyncPositionReady } from './requestSyncBodyRetention.js';
import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';
import { loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach(device => device.sqlite.close()));
function device() {
  const host = textDevice();
  devices.push(host);
  return host;
}

it('merges an offline full edit after its common ancestor body has retired', async () => {
  const online = device();
  const offline = device();
  const v1 = textBranch('v1', 'Original');
  const v2 = textBranch('v2', 'Intermediate', v1);
  const v3 = textBranch('v3', 'Online complete body', v2);
  await applyConvergentSyncNodesWithDbPort(online.db, [v1, v2, v3], { collectVersionPayloads: false });
  await offline.receive([v1]);
  await upsertRemoteVersion(online.db, { ...v1, body_text: null,
    snapshot: { ...v1.snapshot, content: null, body_deleted: true } });
  await applyLocalContentEdit(offline.db, { nodeId: 'topic', baseVersionId: 'v1', versionId: 'd2',
    content: 'Offline complete body', title: 'Topic', hideTitleHeading: false,
    hostName: 'offline', updatedAt: new Date().toISOString() });
  const d2 = await loadRetainedSyncNodeVersionFact(offline.db, 'd2');
  expect(d2).not.toBeNull();
  await online.receive([d2!]);
  const current = await online.current();
  expect(wholeBodies(current)).toEqual(new Set(['Offline complete body', 'Online complete body']));
  expect(current.parent_version_ids).toEqual(expect.arrayContaining(['d2', 'v3']));
  expect((await loadRetainedSyncNodeVersionFact(online.db, 'v1'))!.body_text).toBeNull();
});

it('retires an empty unreferenced ancestor and permits publishing the complete head', async () => {
  const host = device();
  const base = textBranch('base', 'Original');
  const head = textBranch('head', 'Current', base);
  await applyConvergentSyncNodesWithDbPort(host.db, [base, head], { collectVersionPayloads: false });
  host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_remove(json_set(snapshot_json, '$.content', NULL), '$.body_blob_hash')
    WHERE version_id = 'base'`).run();
  host.sqlite.prepare("INSERT INTO node_version_local_holds VALUES ('editor', 'topic', 'base', 'now')").run();
  expect(await collectNodeVersionPayloads(host.db, 'topic')).toEqual({ released: 1, skipped: null });
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'base'))!.snapshot.body_deleted).toBe(true);
  expect(await requestSyncPositionReady(host.db, 'topic', 'head')).toBe(true);
  expect((await host.current()).body_text).toBe('Current');
});
