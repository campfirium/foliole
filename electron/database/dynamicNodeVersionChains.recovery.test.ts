// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function restart(peer: Peer) {
  peer.db.close();
  peer.db = new Database(peer.file);
  peer.db.pragma('foreign_keys = ON');
  peer.driver = createBetterSqlite3Driver(peer.db);
  peer.port = createBetterSqliteDbPort(peer.db);
}

it('preserves a request snapshot through source database reopen while collection follows member positions', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const base = edit(source, 'base');
  await sync(source, target);
  const sent = edit(source, 'sent');
  await withLibraryRequestSnapshot(source, target, async replay => {
    const unsent = edit(source, 'unsent-middle');
    const head = edit(source, 'current');
    restart(source);
    const originals = [base, sent, unsent, head];
    expect(history(source).map((row) => row.version_id)).toEqual(originals);
    expect(history(source).map((row) => row.body_text)).toEqual(['base', null, null, 'current']);
    await replay();
    assertPersisted(target, 'sent', sent);
    expect(history(source).map((row) => row.version_id)).toEqual(originals);
    expect(history(source).map((row) => row.body_text)).toEqual(['base', null, null, 'current']);
    await sync(source, target);
    expect(history(source).map((row) => row.body_text)).toEqual([null, null, null, 'current']);
    await replay();
    expect(history(source).map((row) => row.version_id)).toEqual(originals);
    expect(history(source).map((row) => row.parent_version_id)).toEqual([null, base, sent, unsent]);
    assertPersisted(source, 'current', head);
    assertPersisted(target, 'current', head);
  });
});
