import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { buildSyncIdentityPackFromDriver } from '../../../electron/database/syncIdentityPackBuilder.js';
import { createSyncIdentitySourceView, openSyncIdentitySourceView } from '../../../electron/database/syncIdentitySourceView.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../../../electron/database/syncPackPageBudget.js';
import { fetchDesktopSyncGroupPackBody } from '../../../electron/sync/desktopSyncGroupPackDownload.js';
import { extractSyncIdentityPackDatabaseFromFile } from '../../../electron/sync/syncPackContainerReader.js';
import { decryptDesktopWorkgroupResponseFile } from '../../../electron/sync/workgroupAeadFileNode.js';
import type { SyncIdentityPackPage } from '../../../lib/core/sync/syncIdentityPackPage.js';

import { currentPeer } from './scope.js';

// Replace filesystem and native ZIP operations with their desktop host equivalents.
// Companion probing, candidate selection, SQL apply, and completion stay production code.
export async function createNativeIdentityView() {
  const folder = path.join(currentPeer().root, 'cache');
  await fs.mkdir(folder, { recursive: true });
  const snapshotPath = path.join(folder, `foliole-provider-source-${randomUUID()}.db`);
  const view = await createSyncIdentitySourceView(currentPeer().sqlite, snapshotPath);
  try { return { snapshot_path: snapshotPath.split(path.sep).join('/'), source_view_id: view.sourceViewId }; }
  finally { view.close(); }
}

export async function buildNativeIdentityPack(args: { snapshot_path: string; page: SyncIdentityPackPage }) {
  const view = openSyncIdentitySourceView(args.snapshot_path);
  const outputPath = path.join(currentPeer().root, 'cache', `${randomUUID()}.zip`);
  try {
    await buildSyncIdentityPackFromDriver({ page: args.page, outputPath }, view.driver);
    return { archive_base64url: (await fs.readFile(outputPath)).toString('base64url') };
  } finally {
    view.close();
    await fs.rm(outputPath, { force: true });
  }
}

export async function closeNativeIdentityView(args: { snapshot_path: string }) {
  await fs.rm(args.snapshot_path, { force: true });
  return { closed: true };
}

export async function downloadNativeIdentityPack(args: {
  body: string; expectedPeerId: string; expectedSourcePeerId: string;
  headers: Record<string, string>; url: string;
}) {
  const folder = path.join(currentPeer().root, `download-${randomUUID()}`);
  await fs.mkdir(folder);
  try {
    const url = new URL(args.url);
    const pathWithQuery = url.pathname + url.search;
    const encryptedPath = await fetchDesktopSyncGroupPackBody({ ...args, groupId: 'group',
      method: 'POST', pathWithQuery, outputPath: path.join(folder, 'encrypted.json') });
    const archivePath = path.join(folder, 'authenticated.zip');
    await decryptDesktopWorkgroupResponseFile({ contentType: 'application/zip', encryptedPath,
      groupId: 'group', maxPlaintextBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes,
      method: 'POST', outputPath: archivePath, pathWithQuery });
    const packPath = path.join(folder, 'incoming.db');
    await extractSyncIdentityPackDatabaseFromFile({ archivePath, outputPath: packPath,
      expectedPeerId: args.expectedPeerId, expectedSourcePeerId: args.expectedSourcePeerId,
      maxDatabaseBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.databaseBytes });
    return { packPath, manifest: await readVerifiedNativeManifest(archivePath) };
  } catch (error) {
    await fs.rm(folder, { recursive: true, force: true });
    throw error;
  }
}

async function readVerifiedNativeManifest(archivePath: string): Promise<unknown> {
  const file = await fs.open(archivePath, 'r');
  try {
    const header = Buffer.alloc(30);
    await file.read(header, 0, 30, 0);
    const start = 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const body = Buffer.alloc(header.readUInt32LE(18));
    await file.read(body, 0, body.length, start);
    return JSON.parse(body.toString('utf8'));
  } finally { await file.close(); }
}
