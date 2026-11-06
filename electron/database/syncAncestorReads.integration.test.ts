// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { readTopicAlternativeRecords } from '../../lib/core/sync/topicAlternativeStore.js';

import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';
import { readPersistedTopicBodies } from './topicTextState.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('retains an explicit return to old text against an offline branch and stays stable on duplicate packages', async () => {
  const left = createPeer('left');
  const right = createPeer('right');
  joinPeers(left, right);
  const original = edit(left, 'Original');
  await withLibraryRequestSnapshot(left, right, replay => replay());
  for (const [versionId, content, baseVersionId] of [
    ['changed', 'New body', original], ['restored', 'Original', 'changed']
  ]) {
    await applyLocalContentEdit(left.port, { nodeId: 'topic', versionId: versionId!, content: content!,
      baseVersionId: baseVersionId!, title: 'Topic', hideTitleHeading: false, hostName: 'left',
      updatedAt: versionId === 'changed' ? '2026-10-17T00:01:00Z' : '2026-10-17T00:02:00Z' });
  }
  expect((await loadCurrentSyncNodeRecord(left.port, 'topic'))?.snapshot.text_selection?.version_id).toBe('restored');
  edit(right, 'Offline body');
  await withLibraryRequestSnapshot(right, left, async replay => {
    await replay();
    const result = (await loadCurrentSyncNodeRecord(left.port, 'topic'))!;
    expect(await readPersistedTopicBodies(left.port))
      .toEqual(new Set(['Original', 'Offline body']));
    const alternativeFacts = await readTopicAlternativeRecords(left.port, 'topic');
    expect(alternativeFacts).toHaveLength(1);
    const facts = history(left);
    await replay();
    expect(history(left)).toEqual(facts);
    expect(await readTopicAlternativeRecords(left.port, 'topic')).toStrictEqual(alternativeFacts);
    await withLibraryRequestSnapshot(left, right, replayBack => replayBack());
    for (const peer of [left, right]) {
      assertPersisted(peer, result.body_text!, result.version_id!);
      const current = (await loadCurrentSyncNodeRecord(peer.port, 'topic'))!;
      expect(current.snapshot.text_selection).toEqual(result.snapshot.text_selection);
      expect(await readPersistedTopicBodies(peer.port)).toEqual(new Set(['Original', 'Offline body']));
      expect(await readTopicAlternativeRecords(peer.port, 'topic')).toStrictEqual(alternativeFacts);
    }
  });
});
