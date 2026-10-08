// @vitest-environment node
import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { canonicalContentId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import { selectDesktopFramedSyncNodeManifest } from '../database/desktopFramedSyncOutboundSelection.js';

import { source } from './companionFramedSyncVerifiedOutbound.testSupport.js';

const prefix = '\ufeff中😀\0'.repeat(70_000);
const completeBody = prefix + 'x'.repeat(1048576 - Buffer.byteLength(prefix));

it.each(['', completeBody])('selects the same owned-body publication and fixed bytes after obsolete cache cleanup', async (body) => {
  const host = await source(body);
  try {
    const entry: FramedSyncInventoryEntry = {
      frontierFactIds: [host.record.version_id!], globalId: 'topic', objectType: 'node',
      requiredRelationIds: [], resourceHashes: [sha256(new TextEncoder().encode(body))],
      reviewFactIds: [], sharedStateHash: Uint8Array.from(Buffer.from(host.record.content_hash!, 'hex'))
    };
    const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
    if (!difference) throw new Error('difference_missing');
    const original = await host.db.transaction((tx) => selectDesktopFramedSyncNodeManifest(tx, difference));
    const frozen = host.sqlite.prepare('SELECT data FROM framed_sync_available_blobs WHERE sha256 = ?').pluck()
      .get(Buffer.from(entry.resourceHashes[0]!));
    expect(frozen).toEqual(Buffer.from(body));
    await host.retireObsoleteCache();
    const selected = await host.db.transaction((tx) => selectDesktopFramedSyncNodeManifest(tx, difference));
    expect(selected).toEqual(original);
    expect(await canonicalContentId(selected)).toEqual(await canonicalContentId(original));
    expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get()).toBe(body);
    expect(host.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck()
      .get(host.record.version_id)).toBe(body);
  } finally { host.sqlite.close(); }
});
