// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { alternativeForBody } from '../../lib/core/sync/topicTextState.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeLibraries, createPeer, edit, joinPeers, root, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary } from './syncRequestLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';
import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const hosts: ReturnType<typeof textDevice>[] = [];
beforeEach(startLibraries);
afterEach(async () => { hosts.splice(0).forEach(host => host.sqlite.close()); await closeLibraries(); });
function device() { const host = textDevice(); hosts.push(host); return host; }
const versions = (db: DbPort) => db.query('SELECT version_id, parent_version_id, content_hash, body_text FROM node_sync_versions ORDER BY version_id');
const parents = (db: DbPort) => db.query('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal');
async function difference(db: DbPort) {
  const entry = await readFramedSyncInventoryEntry(db, { objectType: 'node', globalId: 'topic' });
  if (!entry) throw new Error('inventory_missing');
  return compareFramedSyncInventories({ local: [entry], remote: [] })[0]!;
}
function receive(db: DbPort, request: RequestSyncFiles) {
  return applyFramedFactSources(db, [() => request.readFacts()], {
    requireCompleteVersionGraph: true, loadBody: (_db, blob) => request.loadBody(blob)
  });
}

it('rejects an actual stale selection after a source edit and transfers the fresh original history', async () => {
  const source = device(); const target = device();
  const original = textBranch('original', 'Original body');
  await source.receive([original]);
  const stale = await difference(source.db);
  await source.receive([textBranch('edited', 'Edited body', original)]);
  const expectedVersions = await versions(source.db); const expectedParents = await parents(source.db);
  const files = createDesktopFramedSyncFiles(path.join(root, 'stale'));
  await withRequestSyncFiles(files, async request => {
    await expect(writeRequestSyncSnapshot(source.db, stale, request)).rejects.toThrow('framed_sync_source_changed');
    const facts = [];
    for await (const fact of request.readFacts()) facts.push(fact);
    expect(facts).toEqual([]);
  });
  expect(await files.list('requests')).toEqual([]);
  expect(await versions(source.db)).toEqual(expectedVersions);
  expect(await parents(source.db)).toEqual(expectedParents);
  expect(await versions(target.db)).toEqual([]);
  await withRequestSyncFiles(files, async request => {
    await writeRequestSyncSnapshot(source.db, await difference(source.db), request);
    await receive(target.db, request);
  });
  expect(await versions(target.db)).toEqual(expectedVersions);
  expect(await parents(target.db)).toEqual(expectedParents);
  expect((await target.current()).version_id).toBe('edited');
  expect((await target.current()).body_text).toBe('Edited body');
});

it('owns the original main and alternative bodies after source editing, collection and another snapshot release', async () => {
  const source = device(); const target = createPeer('frozen-target');
  const original = textBranch('original', '\ufeffOriginal\r\n😀\u0000end');
  const alternative = alternativeForBody(textBranch('alternative', 'Complete alternative'), '2026-10-13T00:00:00Z');
  original.snapshot.text_alternatives = [alternative];
  original.alternative_bodies = [{ hash: alternative.body_blob_hash, text: 'Complete alternative' }];
  await source.receive([original]);
  const expectedVersions = await versions(source.db); const expectedParents = await parents(source.db);
  const selected = await difference(source.db);
  const files = createDesktopFramedSyncFiles(path.join(root, 'frozen'));
  await withRequestSyncFiles(files, async second => {
    await writeRequestSyncSnapshot(source.db, selected, second);
    await withRequestSyncFiles(files, async first => {
      await writeRequestSyncSnapshot(source.db, selected, first);
      await source.receive([textBranch('edited', 'Later text', original)]);
      source.sqlite.exec(`DELETE FROM content_blob_data; UPDATE node_sync_versions SET body_text = NULL,
        snapshot_json = json_remove(json_set(snapshot_json, '$.content', NULL), '$.text_alternative_bodies')
        WHERE version_id = 'original'`);
      expect(source.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id='original'").pluck().get()).toBeNull();
      await assertFrozenTexts(first, original.body_text!);
    });
    await assertFrozenTexts(second, original.body_text!);
    await receive(target.port, second); await receive(target.port, second);
  });
  expect(await files.list('requests')).toEqual([]);
  const reopened = new Database(target.file, { readonly: true });
  try {
    const db = createBetterSqliteDbPort(reopened);
    expect(await versions(db)).toEqual(expectedVersions);
    expect(await parents(db)).toEqual(expectedParents);
    expect(wholeBodies((await loadCurrentSyncNodeRecord(db, 'topic'))!))
      .toEqual(new Set([original.body_text, 'Complete alternative']));
  } finally { reopened.close(); }
});

async function assertFrozenTexts(request: RequestSyncFiles, main: string) {
  const texts = [];
  for await (const fact of request.readFacts()) for (const blob of fact.blobs) {
    const bytes = await request.loadBody(blob);
    expect(BigInt(bytes.length)).toBe(blob.byteLength);
    texts.push(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  }
  expect(texts).toEqual([main, 'Complete alternative']);
}

it('keeps the receiver edit and both original branches when a previously fixed request arrives', async () => {
  const source = createPeer('sender'); const target = createPeer('receiver');
  joinPeers(source, target);
  edit(source, 'Common body', 'Common'); await syncRequestLibrary(source, target);
  const sender = edit(source, 'Sender branch', 'Sender branch');
  let receiver = '';
  let originals: Awaited<ReturnType<typeof versions>> = [];
  await withLibraryRequestSnapshot(source, target, async replay => {
    receiver = edit(target, 'Receiver branch', 'Receiver branch');
    originals = [...await versions(source.port), ...await versions(target.port)]
      .filter(row => row.version_id === sender || row.version_id === receiver);
    await replay();
    const before = await versions(target.port);
    await replay();
    expect(await versions(target.port)).toEqual(before);
  });
  const reopened = new Database(target.file, { readonly: true });
  try {
    const db = createBetterSqliteDbPort(reopened);
    const current = (await loadCurrentSyncNodeRecord(db, 'topic'))!;
    expect(current.snapshot.title).toBe('Receiver branch');
    expect(current.body_text).toBe('Receiver branch');
    expect(wholeBodies(current)).toEqual(new Set(['Receiver branch', 'Sender branch']));
    expect((await versions(db)).filter(row => row.version_id === sender || row.version_id === receiver))
      .toEqual(expect.arrayContaining(originals));
    expect(current.parent_version_ids?.slice().sort()).toEqual([sender, receiver].sort());
  } finally { reopened.close(); }
});
