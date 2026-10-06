// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const importedState = JSON.stringify({ annotations: 'x'.repeat(170_000) });
const source = { source_fingerprint: 'large-source', provider: 'desktop_text_file',
  source_kind: 'html', source_name: 'Imported article', source_locator: 'article.html',
  first_imported_at: '2026-10-06T00:00:00.000Z', last_imported_at: '2026-10-06T00:00:00.000Z',
  last_content_fingerprint: 'content', latest_node_id: null, watched_binding_id: null,
  watched_relative_path: null, source_ref: null, source_location: null,
  remote_provider: null, remote_connection_ref: null, remote_document_id: null,
  remote_annotations_json: '[]', remote_import_state_json: importedState };

it('transfers a canonical import payload above 64 KiB intact over production HTTP and across restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    const db = new Database(fixture.leftSnapshot.databasePath);
    try {
      await createBetterSqliteDbPort(db).transaction((tx) => applySyncObjectInTransaction(tx, {
        object_type: 'import_source', object_id: source.source_fingerprint,
        content_hash: computeSyncContentHash('import_source', source), deleted_at: null,
        payload_json: JSON.stringify(source), updated_at: source.last_imported_at
      }));
    } finally { db.close(); }
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    assertPayload(fixture.rightSnapshot.databasePath);
    await fixture.restartLeft();
    const target = (await fixture.restartRight()).snapshot;
    expect(await reconnectFixturePeer(fixture.left, target)).toMatchObject({ complete: true });
    assertPayload(target.databasePath);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);

function assertPayload(databasePath: string) {
  const db = new Database(databasePath, { readonly: true });
  try {
    expect(db.prepare('SELECT remote_import_state_json FROM import_sources WHERE source_fingerprint = ?')
      .pluck().get(source.source_fingerprint)).toBe(importedState);
  } finally { db.close(); }
}
