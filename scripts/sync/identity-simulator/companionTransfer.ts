import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../../../electron/database/syncPackPageBudget.js';
import { fetchDesktopSyncGroupPackBody } from '../../../electron/sync/desktopSyncGroupPackDownload.js';
import { extractSyncPackDatabaseFromFile } from '../../../electron/sync/syncPackContainerReader.js';
import { decryptDesktopWorkgroupResponseFile } from '../../../electron/sync/workgroupAeadFileNode.js';
import { assertSyncPackManifestMatchesDatabase } from '../../../lib/core/sync/syncPackManifestValidation.js';

import { currentPeer } from './scope.js';

let sequence = 0;
export async function downloadNativeAdapter(args: {
  expectedPeerId: string; expectedSourcePeerId: string; headers: Record<string, string>; url: string;
}) {
  const root = path.join(currentPeer().root, `download-${++sequence}`);
  await fs.mkdir(root);
  try {
    const url = new URL(args.url);
    const pathWithQuery = url.pathname + url.search;
    const encryptedPath = await fetchDesktopSyncGroupPackBody({ groupId: 'group', headers: args.headers,
      outputPath: path.join(root, 'encrypted.json'), pathWithQuery, url: args.url });
    const archivePath = path.join(root, 'authenticated.zip');
    await decryptDesktopWorkgroupResponseFile({ contentType: 'application/zip', encryptedPath,
      groupId: 'group', maxPlaintextBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes,
      method: 'GET', outputPath: archivePath, pathWithQuery });
    const outputPath = path.join(root, 'incoming.db');
    const manifest = await extractSyncPackDatabaseFromFile({ archivePath, outputPath,
      expectedPeerId: args.expectedPeerId, expectedSourcePeerId: args.expectedSourcePeerId,
      maxDatabaseBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.databaseBytes });
    const port = createBetterSqliteDbPort(currentPeer().sqlite);
    await port.run('ATTACH DATABASE ? AS inc', [outputPath]);
    try { await assertSyncPackManifestMatchesDatabase(port, manifest); }
    finally { await port.run('DETACH DATABASE inc'); }
    return outputPath;
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    if (String(error).includes('sync_group_http_409:sync_pack_source_view_unavailable')) {
      Object.assign(error as object, { code: 'sync_pack_source_view_unavailable' });
    }
    throw error;
  }
}
export async function deleteNativeAdapter(file: string) {
  await fs.rm(path.dirname(file), { recursive: true, force: true });
  return true;
}
