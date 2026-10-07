// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { textBranch, wholeBodies } from '../database/topicTextState.testSupport.js';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

async function read(databasePath: string) {
  const db = new Database(databasePath);
  try { return (await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(db), 'topic'))!; }
  finally { db.close(); }
}

async function write(databasePath: string, records: NativeSyncNodeRecord[]) {
  const db = new Database(databasePath);
  try { await applyConvergentSyncNodesWithDbPort(createBetterSqliteDbPort(db), records); }
  finally { db.close(); }
}

it('converges forks and an adopted attachment over authenticated production HTTP across restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    const base = textBranch('base', 'Base');
    const a = textBranch('a', 'Main longer body', base);
    const b = textBranch('b', 'Other body', base);
    await write(fixture.leftSnapshot.databasePath, [base, a]);
    await write(fixture.rightSnapshot.databasePath, [base, b]);
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    const round = await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    expect(round).toMatchObject({ complete: true });
    const left = await read(fixture.leftSnapshot.databasePath);
    const right = await read(fixture.rightSnapshot.databasePath);
    expect(left.version_id).toBe(right.version_id);
    expect(wholeBodies(left)).toEqual(new Set([a.body_text, b.body_text]));
    const db = new Database(fixture.leftSnapshot.databasePath);
    try {
      await mutateTopicText(createBetterSqliteDbPort(db), { nodeId: 'topic', action: 'promoted',
        alternativeId: left.snapshot.text_alternatives![0]!.id, now: new Date().toISOString(),
        versionId: 'adopt', hostName: 'desktop-a' });
    } finally { db.close(); }
    await fixture.restartLeft();
    const target = (await fixture.restartRight()).snapshot;
    await reconnectFixturePeer(fixture.left, target);
    expect(await reconnectFixturePeer(fixture.left, target)).toMatchObject({ complete: true });
    const adoptedLeft = await read(fixture.leftSnapshot.databasePath);
    const adoptedRight = await read(target.databasePath);
    expect(adoptedLeft.version_id).toBe(adoptedRight.version_id);
    expect(adoptedRight.body_text).toBe(b.body_text);
    expect(adoptedRight.snapshot.text_alternatives).toEqual([]);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
