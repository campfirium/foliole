// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { writeNewNode } from '../../lib/core/database/importPipelineNodes.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';
import { loadWorkspaceNodeDocument } from '../../lib/core/database/workspaceNodeDocument.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import {
  assertPersisted, closeLibraries, createPeer, edit, joinPeers, startLibraries, sync, type Peer
} from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

const FRONTMATTER = '---\nauthor: Ada\ncollections:\n  - "Guide"\n---\n';
const INITIAL = FRONTMATTER + 'Original complete article.\n'.repeat(100);
const NEXT = FRONTMATTER + 'Updated complete article.\r\n'.repeat(100);
const NOW = '2026-10-01T01:00:00.000Z';

function assertMetadata(peer: Peer) {
  expect(loadWorkspaceListSnapshot(peer.driver)?.nodesById.topic).toMatchObject({
    authorText: 'Ada', collections: ['Guide'], hasContent: true
  });
}

function assertNoFullInlineDuplicate(peer: Peer, body: string) {
  const inline = peer.db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic');
  expect(inline).not.toBe(body);
}

it('creates readable complete bodies without retaining a second full node body', () => {
  const source = createPeer('source');
  const version = edit(source, INITIAL);
  assertPersisted(source, INITIAL, version);
  assertMetadata(source);
  assertNoFullInlineDuplicate(source, INITIAL);
});

it('keeps edited body and list metadata after reopening without duplicating the full body', () => {
  const source = createPeer('source');
  edit(source, INITIAL);
  source.driver.transaction((driver) => writeNodeBody({
    driver, nodeId: 'topic', title: 'Topic', content: NEXT, updatedAt: NOW
  }));
  const version = flushNodeSyncVersionWithDriver(source.driver, 'topic', source.name, NOW);
  expect(version).not.toBeNull();
  assertPersisted(source, NEXT, version!);
  assertMetadata(source);
  assertNoFullInlineDuplicate(source, NEXT);
});

it('preserves both peers complete bodies and metadata without a received inline duplicate', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const version = edit(source, INITIAL);
  await sync(source, target);
  assertPersisted(source, INITIAL, version);
  assertPersisted(target, INITIAL, version);
  assertMetadata(source);
  assertMetadata(target);
  assertNoFullInlineDuplicate(target, INITIAL);
});

it('imports a complete article while retaining only its list metadata beside the body', () => {
  const source = createPeer('source');
  const id = source.driver.transaction((driver) => writeNewNode({
    driver, content: INITIAL, hideTitleHeading: false, title: 'Imported', importedAt: NOW
  }));
  const body = source.db.prepare(`SELECT n.content, CAST(data.data AS TEXT) AS body FROM nodes n
    JOIN content_blob_data data ON data.hash = n.body_blob_hash WHERE n.id = ?`).get(id) as {
      content: string; body: string;
    };
  expect(body.body).toBe(INITIAL);
  expect(body.content).not.toContain('Original complete article.');
  expect(loadWorkspaceListSnapshot(source.driver)?.nodesById[id]).toMatchObject({
    authorText: 'Ada', collections: ['Guide'], hasContent: true
  });
});

it('preserves CRLF frontmatter metadata and an empty body across production writes', () => {
  const source = createPeer('source');
  const crlf = INITIAL.replaceAll('\n', '\r\n');
  const version = edit(source, crlf);
  assertPersisted(source, crlf, version);
  assertMetadata(source);
  assertNoFullInlineDuplicate(source, crlf);
  const emptyVersion = edit(source, '');
  assertPersisted(source, '', emptyVersion);
  expect(loadWorkspaceListSnapshot(source.driver)?.nodesById.topic).toMatchObject({
    authorText: null, collections: []
  });
});

it('reads an unhashed legacy body and refuses stale inline when the authoritative blob is missing', () => {
  const source = createPeer('source');
  edit(source, INITIAL);
  source.db.prepare('UPDATE nodes SET body_blob_hash = NULL, content = ? WHERE id = ?').run(INITIAL, 'topic');
  expect(loadWorkspaceNodeDocument(source.driver, 'topic')?.content).toBe(INITIAL);
  assertMetadata(source);
  edit(source, NEXT);
  const before = source.db.prepare('SELECT current_version_id, body_blob_hash FROM nodes WHERE id = ?')
    .get('topic') as { current_version_id: string; body_blob_hash: string };
  source.db.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('Stale inline body', 'topic');
  source.db.prepare('DELETE FROM content_blob_data WHERE hash = ?').run(before.body_blob_hash);
  expect(loadWorkspaceNodeDocument(source.driver, 'topic')).toBeNull();
  source.db.prepare("UPDATE content_blobs SET availability = 'missing' WHERE hash = ?").run(before.body_blob_hash);
  expect(loadWorkspaceListSnapshot(source.driver)?.nodesById.topic?.bodyStatus).toBe('missing');
  expect(source.db.prepare('SELECT current_version_id, body_blob_hash FROM nodes WHERE id = ?').get('topic')).toEqual(before);
});
