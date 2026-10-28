// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { softDeleteNodes, restoreNodes } from '../../lib/core/database/nodeMutations.js';
import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection.js';
import { loadWorkspaceListSnapshot, queryWorkspaceRows } from '../../lib/core/database/workspaceListSnapshot.js';
import { buildWorkspaceListNodesById } from '../../lib/core/database/workspaceListSnapshotNodes.js';
import { readNodeAuthorText } from '../../lib/core/nodes/nodeAuthorFrontmatter.js';
import { readTopicCollections } from '../../lib/core/nodes/topicCollectionsFrontmatter.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { closeLibraries, createPeer, edit, history, startLibraries } from './syncLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const header = '---\nauthor: [[Ada Lovelace]]\ncollections:\n  - "Guide"\n---';
const cases = [
  '', 'No header', 'Body\n---\nauthor: Ada\n---', '---', '---\nauthor: Ada',
  `${header}\nBody`, `${header.replaceAll('\n', '\r\n')}\r\nBody`, `\ufeff${header}\nBody`,
  ' \t--- \nauthor: Ada\n --- \nBody', header,
  '---\nauthor: Ada\n --- \ncollections:\n  - Guide\n---\nBody',
  '---\nauthor: Ada\ncollections: [Guide]\n---\nBody',
  `---\nnote: ${'x'.repeat(20_000)}\nauthor: Ada\ncollections:\n  - Guide\n---\nBody`,
  `${'First paragraph '.repeat(20_000)}\n---\nauthor: Ada\n---`,
  `---\nauthor: Ada\n---\n${'Body\n'.repeat(20_000)}`,
  'First --- paragraph\nauthor: Ada\n---'
];
function summaries(content: string) {
  let collections: string[] = [];
  try { collections = readTopicCollections(content); } catch { /* List behavior for malformed collections. */ }
  return { authorText: readNodeAuthorText(content), collections };
}

it('keeps complete and targeted list metadata equivalent to the original bodies across delimiter formats', () => {
  const peer = createPeer('metadata');
  const insert = peer.db.prepare(`INSERT INTO nodes (id, kind, title, content, opening_text, created_at, updated_at)
    VALUES (?, 'topic', ?, ?, 'Opening stays available', 'now', 'now')`);
  cases.forEach((content, index) => insert.run(`node-${index}`, `Topic ${index}`, content));
  const rows = queryWorkspaceRows(peer.driver);
  const full = loadWorkspaceListSnapshot(peer.driver, { includePdfOpenings: false })!;
  cases.forEach((content, index) => {
    const id = `node-${index}`;
    const scoped = loadWorkspaceListProjection(peer.driver, { nodeIds: [id], structure: false });
    expect(full.nodesById[id]).toMatchObject({ ...summaries(content), content: '', hasContent: content.trim().length > 0 });
    expect(scoped.nodesById[id]).toMatchObject(summaries(content));
    expect(scoped.directOpeningById[id]).toBe('Opening stays available');
    if (content && !content.split('\n', 1)[0]!.includes('---')) {
      expect(rows.find(row => row.id === id)!.collection_source_content).toBeNull();
    }
  });
  expect(peer.db.prepare('SELECT content FROM nodes WHERE id = ?').get('node-5')).toEqual({ content: cases[5] });
});

it('refreshes summaries through real saves, delete/restore and database reopen without retaining ordinary bodies', () => {
  const peer = createPeer('updates');
  for (const content of ['Ordinary body', `${header}\nBody`, 'Replacement body', `${header}\nChanged body`]) {
    edit(peer, content);
    const full = loadWorkspaceListSnapshot(peer.driver, { includePdfOpenings: false })!;
    expect(full.nodesById.topic).toMatchObject(summaries(content));
    const scoped = loadWorkspaceListProjection(peer.driver, { nodeIds: ['topic'], structure: false });
    expect(scoped.nodesById.topic).toMatchObject(summaries(content));
    const reader = new Database(peer.file, { readonly: true });
    try {
      expect(loadWorkspaceListSnapshot(createBetterSqlite3Driver(reader), { includePdfOpenings: false })!
        .nodesById.topic).toMatchObject(summaries(content));
    } finally { reader.close(); }
  }
  softDeleteNodes(peer.driver, { nodeIds: ['topic'], deletedAt: '2026-10-28T00:00:00.000Z' });
  expect(loadWorkspaceListSnapshot(peer.driver)!.nodesById.topic).toMatchObject(summaries(`${header}\nChanged body`));
  restoreNodes(peer.driver, { nodeIds: ['topic'] });
  expect(loadWorkspaceListSnapshot(peer.driver)!.trashedNodeIds).not.toContain('topic');
  expect(loadWorkspaceListSnapshot(peer.driver)!.nodesById.topic).toMatchObject(summaries(`${header}\nChanged body`));
});

it('preserves summary facts after production version creation and remote apply to an independent library', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  for (const content of [`${header}\nBody`, 'Plain replacement']) {
    edit(source, content);
    const row = history(source).at(-1)!;
    const snapshot = JSON.parse(row.snapshot_json);
    const identity = source.db.prepare('SELECT content_hash FROM node_sync_versions WHERE version_id = ?')
      .get(row.version_id) as { content_hash: string };
    const record: NativeSyncNodeRecord = {
      object_type: 'node', object_id: 'topic', host_name: source.name,
      version_id: row.version_id, parent_version_id: row.parent_version_id,
      parent_version_ids: row.parent_version_id ? [row.parent_version_id] : [], ancestor_version_ids: [],
      content_hash: identity.content_hash,
      body_text: row.body_text, updated_at: snapshot.updated_at, version_created_at: snapshot.updated_at, snapshot
    };
    expect((await applySyncNodesWithDbPort(target.port, [record])).appliedIds).toEqual(['topic']);
    for (const peer of [source, target]) {
      expect(buildWorkspaceListNodesById(queryWorkspaceRows(peer.driver, ['topic'])).nodesById.topic)
        .toMatchObject(summaries(content));
      const reader = new Database(peer.file, { readonly: true });
      try {
        expect(loadWorkspaceListSnapshot(createBetterSqlite3Driver(reader), { includePdfOpenings: false })!
          .nodesById.topic).toMatchObject(summaries(content));
        expect(reader.prepare('SELECT content FROM nodes WHERE id = ?').get('topic')).toEqual({ content });
      } finally { reader.close(); }
    }
  }
});
