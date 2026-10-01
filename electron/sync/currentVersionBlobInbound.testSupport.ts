import { expect } from 'vitest';

import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, type DatabaseConnection } from '../database/connection.js';
import { resolveSyncPackPath } from '../database/syncPackBuilderTestSupport.js';

import type { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { negotiateFactView } from './companionLanMultiNodeBatch.testSupport.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

export function moveArticleIntoSource(receiver: DatabaseConnection) {
  const source = openDatabaseConnection().sqlite;
  source.prepare('ATTACH DATABASE ? AS receiver').run(receiver.dbPath);
  try {
    source.exec(`INSERT INTO nodes SELECT * FROM receiver.nodes;
      INSERT INTO node_sync_versions SELECT * FROM receiver.node_sync_versions;
      INSERT INTO sync_object_state SELECT * FROM receiver.sync_object_state;
      UPDATE sync_state_sequence SET high_water = 10 WHERE singleton_id = 1;`);
  } finally { source.exec('DETACH DATABASE receiver'); }
  receiver.sqlite.exec(`DELETE FROM nodes; DELETE FROM node_sync_versions;
    DELETE FROM sync_object_state; DELETE FROM sync_pack_resource_articles;`);
}

export async function receiveArticleOverHttp(server: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>,
  receiver: DatabaseConnection, ids: { source: string; receiver: string }) {
  const { viewId, frontierStateSeq } = await negotiateFactView(server);
  let url = new URL(`/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0&fact_view=${viewId}`,
    server.origin);
  const port = createBetterSqliteDbPort(receiver.sqlite);
  for (let index = 0; index < 12; index++) {
    const archive = await server.archive(url);
    try {
      const packPath = resolveSyncPackPath(`t277-inbound-${index}.db`);
      await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath, outputPath: packPath,
        expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source, maxDatabaseBytes: 4 * 1024 * 1024 });
      await port.run('ATTACH DATABASE ? AS inc', [packPath]);
      try {
        const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
          hostName: 'receiver', sourcePeerId: ids.source, recordVersionReceipt: true,
          enqueueSearchInvalidations: false });
        if (result.dependencyProgress) {
          url = new URL(dependencyResumeUrl(url.href, result.dependencyProgress));
          continue;
        }
        expect(result.toStateSeq).toBe(frontierStateSeq);
        const before = receiver.sqlite.prepare('SELECT * FROM content_blobs').all();
        // Simulate a lost confirmation: replay the committed page with its original cursor.
        const replay = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
          hostName: 'receiver', sourcePeerId: ids.source, enqueueSearchInvalidations: false });
        expect(replay.applied).toBe(false);
        expect(receiver.sqlite.prepare('SELECT * FROM content_blobs').all()).toEqual(before);
        return result;
      } finally { await port.run('DETACH DATABASE inc'); }
    } finally { await archive.cleanup(); }
  }
  throw new Error('t277_inbound_did_not_complete');
}
