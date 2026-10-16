// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { hashTextBody } from '../database/textBodyHash.js';

import { applyLocalContentEdit } from './localContentEdit.js';
import { releaseLocalEditBase, retainLocalEditBase } from './nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { applyConvergentSyncNodesWithDbPort } from './syncNodeConvergence.js';
import { loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach(device => device.sqlite.close()));
async function history(withAlternative = false, carried = false) {
  const host = textDevice();
  devices.push(host);
  const base = textBranch('base', 'Original');
  if (withAlternative) {
    const hash = hashTextBody('Alternative');
    base.snapshot.text_alternatives = [{ id: 'alternative', body_blob_hash: hash, source_host_name: 'peer',
      created_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z' }];
    base.alternative_bodies = [{ hash, text: 'Alternative' }];
  }
  const head = textBranch('head', 'Current', base);
  if (!carried) { head.snapshot.text_alternatives = []; delete head.alternative_bodies; }
  await applyConvergentSyncNodesWithDbPort(host.db, [base, head], { collectVersionPayloads: false });
  return { host, base, head };
}
function deleted(record: ReturnType<typeof textBranch>) {
  return { ...record, body_text: null, alternative_bodies: [],
    snapshot: { ...record.snapshot, content: null, body_deleted: true } };
}

it('rejects deletion of a noncurrent live branch, then retires it after a complete merge', async () => {
  const { host, base, head } = await history();
  const branch = textBranch('branch', 'Branch input', base);
  await upsertRemoteVersion(host.db, branch);
  await upsertRemoteVersion(host.db, deleted(branch));
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'branch'))!.body_text).toBe('Branch input');
  await host.receive([branch]);
  expect((await host.current()).parent_version_ids).toEqual(expect.arrayContaining(['branch', head.version_id]));
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'branch'))!.snapshot.body_deleted).toBe(true);
});

it('retains a baseline alternative unique holder until its editor releases it', async () => {
  const { host, base } = await history(true);
  await retainLocalEditBase(host.db, { holdId: 'editor', nodeId: 'topic', versionId: 'base' });
  await upsertRemoteVersion(host.db, deleted(base));
  await collectNodeVersionPayloads(host.db, 'topic');
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'base'))!.alternative_bodies)
    .toEqual(base.alternative_bodies);
  await releaseLocalEditBase(host.db, 'editor', 'topic');
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'base'))!.snapshot.body_deleted).toBe(true);
});

it('keeps inherited alternatives when complete editor input uses a retired baseline', async () => {
  const { host, base } = await history(true, true);
  await retainLocalEditBase(host.db, { holdId: 'editor', nodeId: 'topic', versionId: 'base' });
  await collectNodeVersionPayloads(host.db, 'topic');
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'base'))!.body_text).toBeNull();
  await applyLocalContentEdit(host.db, { nodeId: 'topic', baseVersionId: 'base', versionId: 'edit',
    content: 'Complete new input', title: 'Topic', hideTitleHeading: false, hostName: 'editor',
    updatedAt: new Date().toISOString() });
  expect((await host.current()).alternative_bodies).toEqual(expect.arrayContaining(base.alternative_bodies!));
});

it.each(['missing identity', 'missing edge', 'cycle', 'wrong owner'])('does not reclaim an unproven graph: %s', async fault => {
  const { host } = await history();
  if (fault === 'missing identity') host.sqlite.prepare("DELETE FROM node_sync_versions WHERE version_id = 'base'").run();
  if (fault === 'missing edge') host.sqlite.prepare("DELETE FROM node_sync_version_parents WHERE version_id = 'head'").run();
  if (fault === 'wrong owner') host.sqlite.prepare("UPDATE node_sync_versions SET object_id = 'other' WHERE version_id = 'base'").run();
  if (fault === 'cycle') host.sqlite.exec(`UPDATE node_sync_versions SET parent_version_id = 'head' WHERE version_id = 'base';
    INSERT INTO node_sync_version_parents VALUES ('base', 'head', 0)`);
  const before = host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  expect(await collectNodeVersionPayloads(host.db, 'topic')).toEqual({ released: 0, skipped: 'lineage_unproven' });
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
});

it.each(['null', 'absent'])('reports missing required text with %s content while retiring other proven history', async representation => {
  const { host } = await history();
  host.sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = 'head'`);
  if (representation === 'absent') host.sqlite.exec("UPDATE node_sync_versions SET snapshot_json = json_remove(snapshot_json, '$.content') WHERE version_id = 'head'");
  expect(await collectNodeVersionPayloads(host.db, 'topic'))
    .toEqual({ released: 1, skipped: 'protected_body_unavailable' });
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'base'))!.snapshot.body_deleted).toBe(true);
});

it.each(['folder', 'item'])('preserves all %s historical bodies', async kind => {
  const { host } = await history();
  host.sqlite.prepare('UPDATE nodes SET kind = ?').run(kind);
  expect(await collectNodeVersionPayloads(host.db, 'topic')).toEqual({ released: 0, skipped: 'non_topic' });
  expect((await loadRetainedSyncNodeVersionFact(host.db, 'base'))!.body_text).toBe('Original');
});
