// @vitest-environment node
import { expect, it } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { textDevice } from './topicTextState.testSupport.js';

const now = '2026-10-07T00:00:00.000Z';

it('creates roots and preserves complete edited text and original version relations without shared body storage', () => {
  const host = textDevice();
  try {
    const driver = createBetterSqlite3Driver(host.sqlite);
    host.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('host_name', JSON.stringify('host'), now);
    const original = '---\r\nsource: Original\r\n---\r\n\ufeffBody😀\0';
    upsertNodeSnapshot(driver, { anchorLink: null, content: original, createdAt: now,
      hostName: 'host', isTitleManual: true, kind: 'topic', nodeId: 'article',
      parentNodeId: 'special-inbox', position: null, reveal: null, title: 'Article', updatedAt: now },
    { searchInvalidation: { workspaceInvalidation: 'defer' } });
    expect(loadNodeBodyResolution(driver, 'special-inbox')).toMatchObject({ content: '', source: 'node', status: 'resolved' });
    expect(flushNodeSyncVersionWithDriver(driver, 'article', 'host', now, 'first')).toBe('first');
    host.sqlite.exec("INSERT INTO node_version_local_holds VALUES ('editor', 'article', 'first', 'now')");
    const prefix = '---\r\nsource: Changed\r\n---\r\n';
    const remaining = 1_048_576 - Buffer.byteLength(prefix);
    const content = prefix + '中😀\0'.repeat(Math.floor(remaining / 8)) + 'a'.repeat(remaining % 8);
    expect(Buffer.byteLength(content)).toBe(1_048_576);
    expect(applyParentContentChange({ driver, nextContent: content, nodeId: 'article', updatedAt: '2026-10-07T01:00:00.000Z' }))
      .toMatchObject({ written: true, finalContent: content, affectedChildIds: [], unmappedAnchorIds: [] });
    expect(loadNodeBodyResolution(driver, 'article')?.status).toBe('resolved');
    expect(host.sqlite.prepare("SELECT content = ? AS exact FROM nodes WHERE id='article'").get(content)).toEqual({ exact: 1 });
    expect(flushNodeSyncVersionWithDriver(driver, 'article', 'host', '2026-10-07T01:00:00.000Z', 'second')).toBe('second');
    expect(host.sqlite.prepare("SELECT body_text = ? AS exact FROM node_sync_versions WHERE version_id='first'").get(original)).toEqual({ exact: 1 });
    expect(host.sqlite.prepare("SELECT body_text = ? AS exact FROM node_sync_versions WHERE version_id='second'").get(content)).toEqual({ exact: 1 });
    expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents').all())
      .toEqual([{ version_id: 'second', parent_version_id: 'first', ordinal: 0 }]);
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    expect(host.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally { host.sqlite.close(); }
});
