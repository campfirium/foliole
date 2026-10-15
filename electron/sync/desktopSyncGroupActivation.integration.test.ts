// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { buildDesktopFramedSyncFixture, createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('activates discovered peers and automatically persists later edits across independent libraries', async () => {
  const buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-activation-build-'));
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  try {
    const nodeId = 't326-activation';
    await fixture.left.seed({ nodeId, title: 'Automatic collection', content: 'Initial content' });
    await fixture.right.invoke('activation_start');
    await fixture.right.invoke('activation_found', { origin: fixture.leftSnapshot.origin });
    expect(readContent(fixture.rightSnapshot.databasePath, nodeId)).toBe('Initial content');
    await fixture.right.seed({ nodeId, title: 'Automatic collection', content: 'Edited after activation' });
    await fixture.right.invoke('activation_mutation');
    expect(readContent(fixture.leftSnapshot.databasePath, nodeId)).toBe('Edited after activation');
    const restarted = await fixture.restartRight();
    expect(readContent(restarted.snapshot.databasePath, nodeId)).toBe('Edited after activation');
    await fixture.right.invoke('activation_start');
    await fixture.right.invoke('activation_found', { origin: fixture.leftSnapshot.origin });
    await fixture.right.seed({ nodeId, title: 'Automatic collection', content: 'Edited after restart' });
    await fixture.right.invoke('activation_mutation');
    expect(readContent(fixture.leftSnapshot.databasePath, nodeId)).toBe('Edited after restart');
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
}, 60_000);

function readContent(databasePath: string, nodeId: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId); }
  finally { db.close(); }
}
