// @vitest-environment node
import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { canonicalContentId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { selectDesktopFramedSyncNodeManifest } from '../database/desktopFramedSyncOutboundSelection.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { migrate, timestamp } from './desktopFramedSyncVerifiedOutboundNodeFacts.testSupport.js';

it.each(['', '\ufeff中😀\0'.repeat(450_000)])('selects the same durable publication manifest after body migration', async (body) => {
  const host = textDevice();
  try {
    const record = textBranch('version', body, undefined, timestamp);
    await upsertRemoteVersion(host.db, record);
    const entry: FramedSyncInventoryEntry = {
      frontierFactIds: ['version'], globalId: 'topic', objectType: 'node',
      requiredRelationIds: [], resourceHashes: [sha256(new TextEncoder().encode(body))],
      reviewFactIds: [], sharedStateHash: Uint8Array.from(Buffer.from(record.content_hash!, 'hex'))
    };
    const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
    if (!difference) throw new Error('difference_missing');
    const old = await host.db.transaction((tx) => selectDesktopFramedSyncNodeManifest(tx, difference));
    const stored = host.sqlite.prepare('SELECT data FROM content_blob_data WHERE hash = ?').pluck()
      .get(Buffer.from(entry.resourceHashes[0]!).toString('hex'));
    expect(Buffer.isBuffer(stored) && stored.equals(Buffer.from(body))).toBe(true);
    await migrate(host);
    const selected = await host.db.transaction((tx) => selectDesktopFramedSyncNodeManifest(tx, difference, 'chunked'));
    expect(selected).toEqual(old);
    expect(await canonicalContentId(selected)).toEqual(await canonicalContentId(old));
    expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'content_blob_data'").get()).toBeUndefined();
  } finally { host.sqlite.close(); }
});
