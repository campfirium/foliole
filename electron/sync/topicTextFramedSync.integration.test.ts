// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { currentParentOrderHash, currentParentOrderPayload } from '../../lib/core/sync/currentParentOrder.js';
import { applyCurrentParentOrderRecord } from '../../lib/core/sync/currentParentOrderStore.js';
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
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
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

function anchoredChild(id: string, kind: 'highlight' | 'cloze', parent: NativeSyncNodeRecord) {
  const record = textBranch(`${id}-version`, `${kind} body`);
  record.object_id = id;
  record.snapshot = { ...record.snapshot, id, kind: 'item', parent_id: 'topic',
    anchor_source_version_id: parent.version_id,
    anchor_link: JSON.stringify({ id: `${id}-anchor`, kind,
      locator: { from: 6, to: 10, originalText: 'Beta' } }) };
  return record;
}

async function arrange(databasePath: string, authorId: string, counter: number, childIds: string[]) {
  const db = new Database(databasePath);
  const sources = [{ authorId, counter, childIds }];
  try {
    await applyCurrentParentOrderRecord(createBetterSqliteDbPort(db), {
      object_type: 'parent_child_order', object_id: 'topic', deleted_at: null, updated_at: '2026-10-11',
      content_hash: currentParentOrderHash('topic', sources),
      payload_json: JSON.stringify(currentParentOrderPayload('topic', sources))
    });
  } finally { db.close(); }
}

function children(databasePath: string) {
  const db = new Database(databasePath);
  try {
    return db.prepare(`SELECT id, parent_id, anchor_link, anchor_source_version_id FROM nodes
      WHERE parent_id = 'topic' ORDER BY id`).all();
  } finally { db.close(); }
}

it('preserves both body forks and their highlight and cloze anchors while order sources converge', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    const base = textBranch('base', 'Alpha Beta');
    const a = textBranch('a', 'Alpha Beta with A', base);
    const b = textBranch('b', 'Alpha Beta with B', base);
    const highlight = anchoredChild('highlight', 'highlight', a);
    const cloze = anchoredChild('cloze', 'cloze', b);
    await write(fixture.leftSnapshot.databasePath, [base, a, highlight]);
    await write(fixture.rightSnapshot.databasePath, [base, b, cloze]);
    await arrange(fixture.leftSnapshot.databasePath, 'left', 1, ['highlight']);
    await arrange(fixture.rightSnapshot.databasePath, 'right', 2, ['cloze']);
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    const before = await read(fixture.leftSnapshot.databasePath);
    expect(wholeBodies(before)).toEqual(new Set([a.body_text, b.body_text]));
    const expected = [cloze, highlight].map(record => ({ id: record.object_id, parent_id: 'topic',
      anchor_link: record.snapshot.anchor_link, anchor_source_version_id: before.version_id }));
    expect(children(fixture.leftSnapshot.databasePath)).toEqual(expected);
    expect(children(fixture.rightSnapshot.databasePath)).toEqual(expected);
    await arrange(fixture.leftSnapshot.databasePath, 'left', 3, ['highlight', 'cloze']);
    await fixture.restartLeft();
    const right = (await fixture.restartRight()).snapshot;
    expect(await reconnectFixturePeer(fixture.left, right)).toMatchObject({ complete: true });
    expect((await read(right.databasePath)).version_id).toBe(before.version_id);
    expect(children(right.databasePath)).toEqual(expected);
    const db = new Database(right.databasePath);
    try {
      expect(db.prepare("SELECT child_ids_json FROM parent_child_order WHERE parent_id = 'topic'").pluck().get())
        .toBe('["highlight","cloze"]');
    } finally { db.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
