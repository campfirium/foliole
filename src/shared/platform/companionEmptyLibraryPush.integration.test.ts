// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import type { Peer } from '../../../electron/database/syncLibrary.testSupport.js';
import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries } from '../../../electron/database/syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from '../../../electron/database/syncRequestLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from '../../../electron/database/syncRequestSnapshot.testSupport.js';
import { wholeBodies } from '../../../electron/database/topicTextState.testSupport.js';
import { applyLocalContentEdit } from '../../../lib/core/sync/localContentEdit.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion, loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';



beforeEach(startLibraries);
afterEach(closeLibraries);

function mobilePeer(id: string) {
  const peer = createPeer(id);
  peer.db.pragma('journal_mode = WAL');
  return peer;
}

async function mobileEdit(peer: Peer, baseVersionId: string, content: string, versionId: string, second: number) {
  return applyLocalContentEdit(peer.port, { baseVersionId, content, hideTitleHeading: false,
    hostName: peer.name, nodeId: 'topic', title: 'Topic', updatedAt: `2026-09-30T01:00:0${second}.000Z`, versionId },
  undefined, { enqueueSearchInvalidations: false });
}

function initializeMobileHost(peer: Peer) {
  peer.db.exec('CREATE TABLE IF NOT EXISTS companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  peer.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?)").run(peer.name);
}

it('pushes each successive production mobile edit when synchronized immediately', async () => {
  const desktop = mobilePeer('desktop');
  const mobile = mobilePeer('mobile');
  joinPeers(desktop, mobile);
  initializeMobileHost(mobile);
  let base = edit(desktop, '123');
  await sync(desktop, mobile);
  for (const [index, content] of ['123456', '123456789'].entries()) {
    const version = `mobile-${index}`;
    await mobileEdit(mobile, base, content, version, index + 1);
    await sync(mobile, desktop);
    assertPersisted(desktop, content, version);
    base = version;
  }
});

it.each([false, true])('pushes offline edits and retires only the intermediate body (collection=%s)', async (collect) => {
  const desktop = mobilePeer('desktop');
  const mobile = mobilePeer('mobile');
  joinPeers(desktop, mobile);
  initializeMobileHost(mobile);
  const a = edit(desktop, '123');
  await sync(desktop, mobile);
  await sync(mobile, desktop);
  await mobileEdit(mobile, a, '123456', 'mobile-B', 1);
  await mobileEdit(mobile, 'mobile-B', '123456789', 'mobile-C', 2);
  if (collect) {
    expect(await collectNodeVersionPayloads(mobile.port, 'topic')).toEqual({ released: 0, skipped: null });
    expect(history(mobile).find((row) => row.version_id === 'mobile-B'))
      .toMatchObject({ body_text: null, parent_version_id: a });
  }
  await withLibraryRequestSnapshot(mobile, desktop, async replay => {
    await replay();
    assertPersisted(desktop, '123456789', 'mobile-C');
    expect(history(desktop).find((row) => row.version_id === 'mobile-B'))
      .toMatchObject({ body_text: null, parent_version_id: a });
    await replay();
    assertPersisted(desktop, '123456789', 'mobile-C');
  });
});

it.each([false, true])('keeps shared highlight history and later edits across a delayed branch response replay (overlap=%s)', async (overlap) => {
  const desktop = mobilePeer('desktop');
  const mobile = mobilePeer('mobile');
  joinPeers(desktop, mobile);
  initializeMobileHost(mobile);
  const anchor = { id: 'shared-anchor', kind: 'highlight' as const };
  const a = edit(desktop, '123\nx=0\n', 'Topic', anchor);
  await sync(desktop, mobile);
  const d = edit(desktop, '023\nx=0\n', 'Topic', anchor);
  const mobileBody = overlap ? '923\nx=0\n' : '123\nx=1\n';
  await mobileEdit(mobile, a, mobileBody, 'mobile-B', 1);
  await withLibraryRequestSnapshot(mobile, desktop, async replay => {
    await replay();
    const resolved = await loadCurrentSyncNodeRecord(desktop.port, 'topic');
    expect(await isStoredAncestorVersion(desktop.port, a, resolved!.version_id!)).toBe(true);
    expect(await isStoredAncestorVersion(desktop.port, d, resolved!.version_id!)).toBe(true);
    expect(await isStoredAncestorVersion(desktop.port, 'mobile-B', resolved!.version_id!)).toBe(true);
    expect(await persistedBodies(desktop)).toEqual(new Set(['023\nx=0\n', mobileBody]));
    const later = `${mobileBody}tail\n`;
    await mobileEdit(mobile, 'mobile-B', later, 'mobile-C', 2);
    await replay();
    await replay();
    assertPersisted(mobile, later, 'mobile-C');
    expect(history(mobile).map((row) => row.version_id)).toEqual(expect.arrayContaining(['mobile-B', 'mobile-C']));
    await sync(mobile, desktop);
    await sync(desktop, mobile);
    await sync(mobile, desktop);
    const final = await loadCurrentSyncNodeRecord(desktop.port, 'topic');
    assertPersisted(desktop, final!.body_text!, final!.version_id!);
    assertPersisted(mobile, final!.body_text!, final!.version_id!);
    expect(await persistedBodies(desktop)).toContain(later);
    expect(await persistedBodies(mobile)).toEqual(await persistedBodies(desktop));
  });
});

async function persistedBodies(peer: Peer) {
  const reopened = new Database(peer.file, { readonly: true });
  try {
    const record = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(reopened), 'topic');
    if (!record) throw new Error('fixture_current_topic_missing');
    return wholeBodies(record);
  } finally { reopened.close(); }
}

it.each(['folder', 'item'] as const)('keeps shared %s identity and ancestry during concurrent edits', async (kind) => {
  const desktop = mobilePeer('desktop');
  const mobile = mobilePeer('mobile');
  joinPeers(desktop, mobile);
  initializeMobileHost(mobile);
  const a = edit(desktop, '', 'Original', null, kind);
  await sync(desktop, mobile);
  const d = edit(desktop, '', 'Desktop title', null, kind);
  const b = edit(mobile, '', 'Mobile title', null, kind);
  await withLibraryRequestSnapshot(mobile, desktop, async replay => {
    await replay();
    const resolved = await loadCurrentSyncNodeRecord(desktop.port, 'topic');
    for (const id of [a, b, d]) {
      expect(await isStoredAncestorVersion(desktop.port, id, resolved!.version_id!)).toBe(true);
    }
    const c = edit(mobile, '', 'Later title', null, kind);
    await replay();
    assertPersisted(mobile, '', c);
    expect(history(mobile).map((row) => row.version_id)).toEqual(expect.arrayContaining([b, c]));
  });
});
