// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const sync = (a: Peer, b: Peer) => withLibraryRequestSnapshot(a, b, replay => replay());
const head = (peer: Peer) => loadCurrentSyncNodeRecord(peer.port, 'topic');

async function createSeparateImageTopic(peer: Peer) {
  const key = `${'b'.repeat(64)}.png`;
  const base = peer.driver.transaction(driver => {
    upsertNodeSnapshot(driver, { anchorLink: null, content: 'Separate image',
      createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z',
      hostName: peer.name, isTitleManual: true, kind: 'topic', nodeId: 'separate-image-topic',
      parentNodeId: null, position: null, reveal: null, title: 'Separate image' });
    return flushNodeSyncVersionWithDriver(driver, 'separate-image-topic', peer.name)!;
  });
  await applyLocalContentEdit(peer.port, { nodeId: 'separate-image-topic', baseVersionId: base,
    baseContent: 'Separate image', versionId: 'separate-image-saved', title: 'Separate image',
    content: `Separate image\n![Separate image](asset://${key})`, hideTitleHeading: false,
    hostName: peer.name, updatedAt: '2026-10-17T04:00:00.000Z',
    newImageReferences: [{ storage_key: key, role: 'image', original_name: 'Separate.png' }] });
}

it.each(['desktop', 'phone'])('preserves edits after a prepared snapshot with independent image ownership: %s', async sourceName => {
  const source = createPeer(sourceName);
  const target = createPeer(sourceName === 'desktop' ? 'phone' : 'desktop');
  joinPeers(source, target);
  edit(source, 'Initial clean text');
  await sync(source, target);
  const original = (await head(source))!;
  await createSeparateImageTopic(source);
  expect((await head(source))!.version_id).toBe(original.version_id);
  edit(source, 'Source branch');
  await withLibraryRequestSnapshot(source, target, async replay => {
    for (let index = 1; index <= 3; index++) edit(target, `Target branch ${index}`);
    await replay();
  });
  await sync(target, source); await sync(source, target);
  const converged = (await head(source))!;
  const bodies = [converged.body_text, ...converged.alternative_bodies?.map(body => body.text) ?? []];
  expect(bodies).toContain('Source branch');
  expect(bodies).toContain('Target branch 3');
  const counts = [history(source).length, history(target).length];
  for (let round = 0; round < 3; round++) { await sync(source, target); await sync(target, source); }
  expect([history(source).length, history(target).length]).toEqual(counts);
  for (const peer of [source, target]) {
    const current = (await head(peer))!;
    expect(current.version_id).toBe(converged.version_id);
    expect(JSON.parse(current.snapshot.resource_references ?? '[]')).toEqual([]);
    const image = await loadCurrentSyncNodeRecord(peer.port, 'separate-image-topic');
    expect(JSON.parse(image!.snapshot.resource_references!)).toEqual([
      { storage_key: `${'b'.repeat(64)}.png`, role: 'image', original_name: 'Separate.png' }
    ]);
    assertPersisted(peer, converged.body_text!, converged.version_id!);
  }
});

it('does not create new versions during empty exchanges or sequential acknowledged edits', async () => {
  const a = createPeer('desktop');
  const b = createPeer('phone');
  joinPeers(a, b);
  edit(a, 'Original complete body');
  await sync(a, b);
  for (let index = 0; index < 3; index++) {
    const base = (await head(b))!;
    await applyLocalContentEdit(b.port, { nodeId: 'topic', baseVersionId: base.version_id!,
      versionId: `phone-edit-${index}`, content: `${base.body_text}\nMarker ${index}`,
      title: 'Topic', hideTitleHeading: false, hostName: 'phone',
      updatedAt: `2026-10-17T03:00:0${index}.000Z` });
    await sync(b, a);
    await sync(a, b);
  }
  const counts = [history(a).length, history(b).length];
  for (let index = 0; index < 4; index++) {
    expect(flushNodeSyncVersionWithDriver(a.driver, 'topic', 'desktop')).toBeNull();
    await sync(a, b);
    await sync(b, a);
  }
  expect([history(a).length, history(b).length]).toEqual([4, 4]);
  expect([history(a).length, history(b).length]).toEqual(counts);
});

it('metadata-only flush should preserve the main body selection during a concurrent text edit', async () => {
  const a = createPeer('desktop');
  const b = createPeer('phone');
  joinPeers(a, b);
  const base = edit(a, 'Original complete body');
  await sync(a, b);
  // Seed the exact metadata mutation performed by updateNodeResources; run the real version writer.
  const resources = JSON.stringify([{ storage_key: `${'a'.repeat(64)}.png`, role: 'image', original_name: 'sample.png' }]);
  a.driver.execute(`UPDATE nodes SET resource_references = ?, updated_at = ?,
    last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = 'topic'`,
  [resources, '2026-10-17T03:00:01.000Z', 'desktop']);
  flushNodeSyncVersionWithDriver(a.driver, 'topic', 'desktop', '2026-10-17T03:00:01.000Z');
  await applyLocalContentEdit(b.port, { nodeId: 'topic', baseVersionId: base, versionId: 'phone-first',
    content: 'Original complete body\nMarker 1', title: 'Topic', hideTitleHeading: false,
    hostName: 'phone', updatedAt: '2026-10-17T03:00:02.000Z' });
  await sync(b, a);
  const merged = (await head(a))!;
  expect(merged.body_text).toBe('Original complete body\nMarker 1');
  expect(merged.snapshot.text_alternatives).toEqual([]);
});

it('creates one merge for a new stale-base operation, then remains stable on replay', async () => {
  const a = createPeer('desktop');
  const b = createPeer('phone');
  joinPeers(a, b);
  const base = edit(a, 'Original');
  await sync(a, b);
  edit(a, 'Desktop concurrent input');
  await applyLocalContentEdit(b.port, { nodeId: 'topic', baseVersionId: base, versionId: 'phone-first',
    content: 'Phone concurrent input', title: 'Topic', hideTitleHeading: false,
    hostName: 'phone', updatedAt: '2026-10-17T03:00:02.000Z' });
  await sync(b, a);
  // The phone has not received the first merge when its next operation is committed.
  await applyLocalContentEdit(b.port, { nodeId: 'topic', baseVersionId: 'phone-first', versionId: 'phone-second',
    content: 'Phone concurrent input\nNext marker', title: 'Topic', hideTitleHeading: false,
    hostName: 'phone', updatedAt: '2026-10-17T03:00:03.000Z' });
  await sync(b, a);
  await sync(a, b);
  const counts = [history(a).length, history(b).length];
  for (let index = 0; index < 3; index++) {
    await sync(b, a);
    await sync(a, b);
  }
  expect([history(a).length, history(b).length]).toEqual(counts);
  expect(counts).toEqual([6, 6]);
  const finalA = (await head(a))!;
  expect((await head(b))!.version_id).toBe(finalA.version_id);
});

it('syncs image names and body together, preserves a stale editor baseline and converges across empty replay', async () => {
  const a = createPeer('desktop'); const b = createPeer('phone'); joinPeers(a, b);
  const base = edit(a, 'Original');
  await sync(a, b);
  const image = { storage_key: `${'f'.repeat(64)}.png`, role: 'image' as const, original_name: 'First name.png' };
  const input = { nodeId: 'topic', baseVersionId: base, baseContent: 'Original', versionId: 'insert-images',
    content: `Original\n![photo](asset://${image.storage_key})`, title: 'Topic', hideTitleHeading: false,
    hostName: 'desktop', updatedAt: '2026-10-17T04:00:00.000Z', newImageReferences: [image] };
  await applyLocalContentEdit(a.port, input);
  await sync(a, b); await sync(b, a);
  expect(history(a)).toHaveLength(2); expect(history(b)).toHaveLength(2);
  expect((await head(b))!.body_text).toBe(input.content);
  expect(JSON.parse((await head(b))!.snapshot.resource_references!)).toEqual([image]);
  await applyLocalContentEdit(b.port, { ...input, baseContent: input.content, baseVersionId: 'insert-images', versionId: 'mobile-edit',
    content: `${input.content}\nMobile edit`, hostName: 'phone', updatedAt: '2026-10-17T04:00:01.000Z', newImageReferences: [] });
  await sync(b, a); await sync(a, b);
  await applyLocalContentEdit(a.port, input);
  const counts = [history(a).length, history(b).length];
  for (let round = 0; round < 3; round++) { await sync(a, b); await sync(b, a); }
  expect([history(a).length, history(b).length]).toEqual(counts);
  expect((await head(a))!.version_id).toBe((await head(b))!.version_id);
  expect(JSON.parse((await head(a))!.snapshot.resource_references!)).toEqual([image]);
});
