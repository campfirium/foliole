import { collectTextBodyBlobCandidates } from '../../lib/core/database/textBodyBlobCollection.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { runDesktopAttachmentMaintenance } from '../attachments/attachmentMaintenanceService.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

/** Exercise the existing collectors against only this fixture's isolated library. */
export async function collectDesktopFramedSyncFixtureContent() {
  const connection = openDatabaseConnection();
  const db = createBetterSqliteDbPort(connection.sqlite);
  for (const row of await db.query<{ id: string }>('SELECT id FROM nodes')) {
    await collectNodeVersionPayloads(db, row.id, 32, true);
  }
  const hashes = connection.driver.queryAll<{ hash: string }>(
    "SELECT hash FROM content_blobs WHERE kind = 'text_body'").map((row) => row.hash);
  const bodies = collectTextBodyBlobCandidates(connection.driver, hashes);
  await runDesktopAttachmentMaintenance({ action: 'configure',
    settings: { automatic: false, observationThreshold: 1 } });
  await runDesktopAttachmentMaintenance({ action: 'observe' });
  const resources = await runDesktopAttachmentMaintenance({ action: 'clean' });
  return { bodies, resources };
}
