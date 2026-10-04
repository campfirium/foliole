import { applySyncIdentityPackWithDbPort } from '../../lib/core/sync/syncIdentityPackApply.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { materializeDesktopSettingRecord } from '../database/desktopSettingMaterializer.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { extractSyncIdentityPackDatabaseFromFile } from './syncPackContainerReader.js';

export async function applyDesktopSyncIdentityArchive(args: {
  archivePath: string;
  expectedPageId?: string;
  incomingPath: string;
  sourceHostName?: string;
  sourcePeerId: string;
  targetPeerId: string;
}) {
  const manifest = await extractSyncIdentityPackDatabaseFromFile({
    archivePath: args.archivePath, expectedPeerId: args.targetPeerId,
    expectedSourcePeerId: args.sourcePeerId,
    maxDatabaseBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.databaseBytes,
    outputPath: args.incomingPath
  });
  if (args.expectedPageId && manifest.identity_page.page_id !== args.expectedPageId) {
    throw new Error('sync_identity_pack_page_changed');
  }
  return runWithDatabaseConnectionOwner(async () => {
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite,
      { name: 'desktop-sync-identity-pack-apply' });
    const hostName = loadOrCreateDesktopHostName();
    await port.run(`ATTACH DATABASE '${args.incomingPath.replaceAll("'", "''")}' AS inc`);
    try {
      const result = await applySyncIdentityPackWithDbPort(port, manifest, {
        hostName,
        ...(args.sourceHostName ? { sourceHostName: args.sourceHostName } : {}),
        onSettingApplied: materializeDesktopSettingRecord
      });
      return { ...result, pageId: manifest.identity_page.page_id };
    } finally { await port.run('DETACH DATABASE inc'); }
  });
}
