// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadRetainedSyncNodeVersionFact } from '../../lib/core/sync/syncNodeGraph.js';

import { assertPersisted, closeLibraries, createPeer, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const key = { globalId: 'topic', objectType: 'node' };
const original = 'Original complete body 中文😀';
async function peers() {
  const a = createPeer('a'); const b = createPeer('b'); joinPeers(a, b);
  const base = textBranch('base', original);
  const head = textBranch('head', 'Current', base);
  for (const peer of [a, b]) await applyConvergentSyncNodesWithDbPort(peer.port, [base, head], { collectVersionPayloads: false });
  return { a, b, base };
}

it.each(['driver', 'port'])('preserves a complete historical body hash before %s retirement and converges without its text', async adapter => {
  const { a, b, base } = await peers();
  a.db.exec("UPDATE node_sync_versions SET snapshot_json = json_remove(snapshot_json, '$.body_blob_hash') WHERE version_id = 'base'");
  for (const peer of [a, b]) {
    if (adapter === 'driver') collectNodeVersionChainWithDriver(peer.driver, 'topic');
    else await collectNodeVersionPayloads(peer.port, 'topic');
  }
  expect((await loadRetainedSyncNodeVersionFact(a.port, 'base'))!.snapshot.body_blob_hash).toBe(hashTextBody(original));
  await withLibraryRequestSnapshot(b, a, replay => replay());
  await withLibraryRequestSnapshot(a, b, replay => replay());
  const entries = await Promise.all([a, b].map(peer => readFramedSyncInventoryEntry(peer.port, key)));
  expect(compareFramedSyncDatabaseInventories({ local: [entries[0]!], remote: [entries[1]!] })).toEqual([]);
  for (const peer of [a, b]) {
    const retained = (await loadRetainedSyncNodeVersionFact(peer.port, 'base'))!;
    expect(retained).toMatchObject({ content_hash: base.content_hash, body_text: null,
      snapshot: { body_deleted: true, body_blob_hash: hashTextBody(original) } });
    assertPersisted(peer, 'Current', 'head');
  }
});

it.each(['retired', 'complete'])('converges with a matching %s fact without resurrecting retired text', async form => {
  const { a, b } = await peers();
  await collectNodeVersionPayloads(a.port, 'topic');
  if (form === 'retired') await collectNodeVersionPayloads(b.port, 'topic');
  a.db.exec("UPDATE node_sync_versions SET snapshot_json = json_remove(snapshot_json, '$.body_blob_hash') WHERE version_id = 'base'");
  await withLibraryRequestSnapshot(b, a, replay => replay());
  expect((await loadRetainedSyncNodeVersionFact(a.port, 'base'))!.snapshot.body_blob_hash ?? null).toBeNull();
  await a.port.transaction(async tx => upsertRemoteVersion(tx, (await loadRetainedSyncNodeVersionFact(b.port, 'base'))!));
  const expectedHash = hashTextBody(original);
  const received = (await loadRetainedSyncNodeVersionFact(a.port, 'base'))!;
  expect(received).toMatchObject({ body_text: null, snapshot: { body_deleted: true } });
  expect(received.snapshot.body_blob_hash ?? null).toBe(expectedHash);
  await withLibraryRequestSnapshot(a, b, replay => replay());
  const entries = await Promise.all([a, b].map(peer => readFramedSyncInventoryEntry(peer.port, key)));
  expect(compareFramedSyncDatabaseInventories({ local: [entries[0]!], remote: [entries[1]!] })).toEqual([]);
  const retained = (await loadRetainedSyncNodeVersionFact(a.port, 'base'))!;
  expect(retained).toMatchObject({ body_text: null, snapshot: { body_deleted: true } });
  expect(retained.snapshot.body_blob_hash ?? null).toBe(expectedHash);
  expect((await loadRetainedSyncNodeVersionFact(b.port, 'base'))!.snapshot.body_blob_hash).toBe(hashTextBody(original));
  assertPersisted(a, 'Current', 'head');
});
