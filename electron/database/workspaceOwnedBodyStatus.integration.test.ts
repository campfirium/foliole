// @vitest-environment node
import { expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { WORKSPACE_BODY_STATUS_SQL } from '../../lib/core/database/workspaceBodyStatus.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textDevice } from './topicTextState.testSupport.js';

it.each(['absent', 'missing', 'fetching', 'failed'] as const)('reports saved complete text as readable regardless of an obsolete %s cache', (availability) => {
  const host = textDevice();
  try {
    const driver = createBetterSqlite3Driver(host.sqlite);
    const content = '\ufeffCurrent 中😀\0 body';
    const hash = hashTextBody(content);
    host.sqlite.prepare("INSERT INTO nodes (id, kind, title, content, body_blob_hash, created_at, updated_at) VALUES ('node', 'topic', 'Article', ?, ?, 'now', 'now')")
      .run(content, hash);
    if (availability !== 'absent') {
      upsertTextBodyBlob(driver, content, 'now');
      host.sqlite.prepare('UPDATE content_blobs SET availability = ? WHERE hash = ?').run(availability, hash);
    }
    expect(host.sqlite.prepare(`SELECT ${WORKSPACE_BODY_STATUS_SQL} AS status FROM nodes n
      LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash WHERE n.id = 'node'`).get())
      .toEqual({ status: 'ready' });
  } finally { host.sqlite.close(); }
});

it('reports a legal empty owned body without fetching an empty shared cache', () => {
  const host = textDevice();
  try {
    host.sqlite.prepare("INSERT INTO nodes (id, kind, title, content, body_blob_hash, created_at, updated_at) VALUES ('node', 'topic', 'Article', '', ?, 'now', 'now')")
      .run(hashTextBody(''));
    expect(host.sqlite.prepare(`SELECT ${WORKSPACE_BODY_STATUS_SQL} AS status FROM nodes n
      LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash WHERE n.id = 'node'`).get())
      .toEqual({ status: 'empty' });
  } finally { host.sqlite.close(); }
});
