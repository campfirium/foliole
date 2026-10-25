// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { runPreparedImport } from '../../lib/core/database/importPipeline.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { PreparedImportRecord } from '../../lib/core/import/contract.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const at = '2026-10-20T00:00:00.000Z';

function prepared(content: string, highlights = ['kept', 'missing']): PreparedImportRecord {
  return { provider: 'desktop_text_file', sourceName: 'article.md', sourceLocator: '/isolated/article.md',
    sourceKind: 'markdown', sourceFingerprint: 'article', contentFingerprint: content,
    nodeTitle: 'Article', hideTitleHeading: false, content, degradedReason: null,
    importedAt: at, sourceProfile: 'body_with_highlight_sidecar',
    matchedHighlights: highlights.map(text => ({ content: text, label: null, nodeId: `highlight-${text}` })) };
}

function seed(peer: ReturnType<typeof createPeer>) {
  const result = runPreparedImport(peer.driver, prepared('kept missing'), { resetImportedStructure: true });
  if (!result.nodeId) throw new Error('missing_import_root');
  writeNodeBody({ driver: peer.driver, nodeId: 'highlight-kept', content: 'My edited content',
    title: 'My title', updatedAt: at });
  peer.db.exec(`UPDATE nodes SET title='My title', kind='item', reveal='My answer',
    is_title_manual=1, anchor_link=json_set(anchor_link,'$.kind','cloze') WHERE id='highlight-kept';
    INSERT INTO node_review (node_id,due,stability,difficulty,reps,lapses,state)
    VALUES ('highlight-kept','2026-11-01',12,4,3,1,2), ('highlight-missing','2026-11-02',8,5,2,0,2);`);
  for (const id of ['highlight-kept', 'highlight-missing']) upsertSyncObjectState(peer.driver, {
    objectType: 'node_review', objectId: id, contentHash: hashTextBody(id), lastModifiedByHostName: peer.name,
    updatedAt: at, syncDirty: true
  });
  addLog(peer, 'highlight-kept', 'first');
  addLog(peer, 'highlight-missing', 'omitted');
  return result.nodeId;
}

function addLog(peer: ReturnType<typeof createPeer>, nodeId: string, opId: string) {
  peer.driver.execute(`INSERT INTO review_log
    (id,op_id,host_name,node_id,grade,scheduler_version,reviewed_at,due_before,due_after,stability_before,stability_after,difficulty_before,difficulty_after)
    VALUES (?,?,?,?,3,'test',?,'2026-10-20','2026-11-01',1,12,4,4)`, [`log-${opId}`, opId, peer.name, nodeId, at]);
}

function learning(peer: ReturnType<typeof createPeer>) {
  return {
    reviews: peer.db.prepare('SELECT * FROM node_review ORDER BY node_id').all(),
    logs: peer.db.prepare('SELECT * FROM review_log ORDER BY op_id').all()
  };
}

it('retains same identities, user edits and all learning through repeated mixed and omitted reimports', () => {
  const peer = createPeer('source');
  const nodeId = seed(peer);
  const before = learning(peer);
  for (const content of ['Updated kept new', 'Again kept new']) {
    runPreparedImport(peer.driver, prepared(content, ['kept', 'new']), {
      forceUpdateExistingNodeId: nodeId, resetImportedStructure: true
    });
    expect(learning(peer)).toEqual(before);
    expect(peer.db.prepare(`SELECT title,content,kind,reveal FROM nodes WHERE id='highlight-kept'`).get())
      .toEqual({ title: 'My title', content: 'My edited content', kind: 'item', reveal: 'My answer' });
    expect(peer.db.prepare(`SELECT deleted_at,anchor_link FROM nodes WHERE id='highlight-missing'`).get())
      .toEqual({ deleted_at: null, anchor_link: expect.not.stringContaining('locator') });
    expect(peer.db.prepare('SELECT id FROM nodes WHERE parent_id=?').all(nodeId)).toHaveLength(3);
    const order = loadDerivedNodeOrder(peer.driver);
    expect(order.indexOf('highlight-missing')).toBeGreaterThan(order.indexOf('highlight-new'));
  }
  runPreparedImport(peer.driver, prepared('Entirely different body', ['kept']), {
    forceUpdateExistingNodeId: nodeId, resetImportedStructure: true
  });
  expect(learning(peer)).toEqual(before);
  expect(peer.db.prepare(`SELECT anchor_link FROM nodes WHERE id='highlight-kept'`).get())
    .toEqual({ anchor_link: expect.not.stringContaining('locator') });
  const reopened = new Database(peer.file, { readonly: true });
  try {
    expect(reopened.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(before.logs);
    expect(reopened.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(before.reviews);
    expect(reopened.pragma('foreign_key_check')).toEqual([]);
  } finally { reopened.close(); }
});

it('preserves the union of both independent libraries score histories across reimport and repeated sync', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const nodeId = seed(source);
  for (const row of source.driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE deleted_at IS NULL')) {
    flushNodeSyncVersionWithDriver(source.driver, row.id, source.name, at);
  }
  await sync(source, target);
  const reviewBefore = learning(source).reviews;
  expect(learning(target).reviews).toEqual(reviewBefore);
  addLog(target, 'highlight-kept', 'offline-target');
  runPreparedImport(source.driver, prepared('New kept body', ['kept']), {
    forceUpdateExistingNodeId: nodeId, resetImportedStructure: true
  });
  for (const row of source.driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE deleted_at IS NULL')) {
    flushNodeSyncVersionWithDriver(source.driver, row.id, source.name, '2026-10-21T00:00:00.000Z');
  }
  for (let i = 0; i < 2; i += 1) {
    await sync(source, target);
    await sync(target, source);
  }
  for (const peer of [source, target]) {
    expect(learning(peer).reviews).toEqual(reviewBefore);
    const anchor = peer.db.prepare<[], { anchor_link: string }>("SELECT anchor_link FROM nodes WHERE id='highlight-kept'").get()!;
    expect(JSON.parse(anchor.anchor_link)).toMatchObject({ kind: 'cloze', locator: { from: 4, originalText: 'kept' } });
    const reopened = new Database(peer.file, { readonly: true });
    try {
      expect(reopened.prepare('SELECT op_id FROM review_log ORDER BY op_id').all())
        .toEqual([{ op_id: 'first' }, { op_id: 'offline-target' }, { op_id: 'omitted' }]);
      expect(reopened.prepare(`SELECT content FROM nodes WHERE id='highlight-kept'`).get())
        .toEqual({ content: 'My edited content' });
      expect(reopened.prepare(`SELECT id FROM nodes WHERE id='highlight-missing' AND deleted_at IS NULL`).get())
        .toEqual({ id: 'highlight-missing' });
    } finally { reopened.close(); }
  }
});

it('uses explicit source identity before text and reuses an unambiguous original excerpt without overwriting edits', () => {
  const peer = createPeer('source');
  const nodeId = seed(peer);
  const before = learning(peer);
  const input = { ...prepared('kept missing'), matchedHighlights: [
    { content: 'kept', label: null },
    { content: 'A new source excerpt', locatorText: 'missing', label: null, nodeId: 'new-source-id' }
  ] };
  runPreparedImport(peer.driver, input, { forceUpdateExistingNodeId: nodeId, resetImportedStructure: true });
  expect(learning(peer)).toEqual(before);
  expect(peer.db.prepare("SELECT content FROM nodes WHERE id='highlight-kept'").get())
    .toEqual({ content: 'My edited content' });
  expect(peer.db.prepare('SELECT id FROM nodes WHERE parent_id=?').all(nodeId)).toHaveLength(3);
  expect(peer.db.prepare("SELECT content FROM nodes WHERE id='new-source-id'").get())
    .toEqual({ content: 'A new source excerpt' });
});

it('detaches a user-created excerpt from a replaced watched body and keeps it after the located excerpts', () => {
  const peer = createPeer('source');
  const nodeId = seed(peer);
  peer.driver.execute(`INSERT INTO nodes (id,parent_id,title,content,is_title_manual,anchor_link,created_at,updated_at)
    VALUES ('local',?,'Local note','My note',1,?, ?, ?)`, [nodeId,
    JSON.stringify({ id: 'local-anchor', kind: 'highlight', locator: { from: 5, to: 12, originalText: 'missing' } }), at, at]);
  runPreparedImport(peer.driver, prepared('New kept body', ['kept']), { forceUpdateExistingNodeId: nodeId, resetImportedStructure: true });
  expect(peer.db.prepare("SELECT content,anchor_link FROM nodes WHERE id='local'").get())
    .toEqual({ content: 'My note', anchor_link: JSON.stringify({ id: 'local-anchor', kind: 'highlight' }) });
  const order = loadDerivedNodeOrder(peer.driver);
  expect(order.indexOf('local')).toBeGreaterThan(order.indexOf('highlight-kept'));
});
