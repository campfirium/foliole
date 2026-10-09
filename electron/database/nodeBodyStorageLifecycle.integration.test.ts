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

function assertDirectBody(peer: Peer, body: string) {
  const inline = peer.db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic');
  expect(inline).toBe(body);
  expect(peer.db.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
}

it('creates readable complete bodies in its business record without a permanent shared blob', () => {
  const source = createPeer('source');
  const version = edit(source, INITIAL);
  assertPersisted(source, INITIAL, version);
  assertMetadata(source);
  assertDirectBody(source, INITIAL);
});

it('keeps edited body and list metadata after reopening through direct business records', () => {
  const source = createPeer('source');
  edit(source, INITIAL);
  source.driver.transaction((driver) => writeNodeBody({
    driver, nodeId: 'topic', title: 'Topic', content: NEXT, updatedAt: NOW
  }));
  const version = flushNodeSyncVersionWithDriver(source.driver, 'topic', source.name, NOW);
  expect(version).not.toBeNull();
  assertPersisted(source, NEXT, version!);
  assertMetadata(source);
  assertDirectBody(source, NEXT);
});

it('preserves both peers complete bodies and metadata with direct readable current records', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const version = edit(source, INITIAL);
  await sync(source, target);
  assertPersisted(source, INITIAL, version);
  assertPersisted(target, INITIAL, version);
  assertMetadata(source);
  assertMetadata(target);
  assertDirectBody(target, INITIAL);
});

it('imports a complete article with a direct body and lightweight list projection', () => {
  const source = createPeer('source');
  const id = source.driver.transaction((driver) => writeNewNode({
    driver, content: INITIAL, hideTitleHeading: false, title: 'Imported', importedAt: NOW
  }));
  expect(loadWorkspaceNodeDocument(source.driver, id)?.content).toBe(INITIAL);
  expect(source.db.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
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
  assertDirectBody(source, crlf);
  const emptyVersion = edit(source, '');
  assertPersisted(source, '', emptyVersion);
  expect(loadWorkspaceListSnapshot(source.driver)?.nodesById.topic).toMatchObject({
    authorText: null, collections: []
  });
});

it('reads direct current bodies independently of obsolete shared blob availability', () => {
  const source = createPeer('source');
  edit(source, INITIAL);
  expect(loadWorkspaceNodeDocument(source.driver, 'topic')?.content).toBe(INITIAL);
  assertMetadata(source);
  edit(source, NEXT);
  source.db.prepare('UPDATE nodes SET body_blob_hash = ? WHERE id = ?').run('obsolete-missing-hash', 'topic');
  const before = source.db.prepare('SELECT current_version_id, body_blob_hash FROM nodes WHERE id = ?').get('topic');
  expect(loadWorkspaceNodeDocument(source.driver, 'topic')?.content).toBe(NEXT);
  expect(loadWorkspaceListSnapshot(source.driver)?.nodesById.topic?.bodyStatus).toBe('ready');
  expect(source.db.prepare('SELECT current_version_id, body_blob_hash FROM nodes WHERE id = ?').get('topic')).toEqual(before);
});
