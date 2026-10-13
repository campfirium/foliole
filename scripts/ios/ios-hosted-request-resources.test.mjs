// @vitest-environment node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath(name) { if (!sandbox.root) throw new Error('fixture_not_initialized'); return path.join(sandbox.root, name); },
  isPackaged: false
} }));

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance, runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { resolveRuntimeDataPaths } from '../../electron/database/runtimeDataPaths.js';
import { openDesktopAttachmentBlockReceiver } from '../../electron/sync/desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from '../../electron/sync/desktopAttachmentBlockSource.js';
import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { transferAttachmentBlocks } from '../../lib/core/sync/attachmentBlockTransfer.js';
import { hostedAttachments } from './ios-hosted-request-seed-data.ts';
import { prepareIosHostedRequestResources } from './ios-hosted-request-resources.ts';

let destination, receiver;
afterEach(async () => {
  await receiver?.close(); receiver = undefined; destination?.close(); destination = undefined;
  await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection()); vi.unstubAllEnvs();
  if (sandbox.root) fs.rmSync(sandbox.root, { recursive: true, force: true }); sandbox.root = '';
});

it('transfers the original PDF through current resource owners while corrupt and absent bytes never become available', async () => {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  sandbox.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/hosted-resources-'));
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(sandbox.root, 'provider'));
  const sourcePaths = await runWithDatabaseConnectionOwner(() => {
    initializeDatabaseSchema(openDatabaseConnection().sqlite);
    return resolveRuntimeDataPaths();
  });
  await prepareIosHostedRequestResources(sourcePaths.databasePath);
  const source = createDesktopAttachmentBlockSource(sourcePaths.assetsDir);
  const assetsDir = path.join(sandbox.root, 'phone', 'Assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  destination = new Database(':memory:'); initializeDatabaseSchema(destination);
  const db = createBetterSqliteDbPort(destination);
  receiver = await openDesktopAttachmentBlockReceiver({ libraryRoot: path.dirname(assetsDir), assetsDir,
    availability: (hash, available) => recordFramedSyncResourceAvailability(db, [hash], available) });
  expect(receiver.kind).toBe('acquired');
  const validKey = `${hostedAttachments.valid.hash}.pdf`;
  await transferAttachmentBlocks({ storageKey: validKey, source, destination: receiver });
  const bytes = fs.readFileSync(path.join(assetsDir, validKey));
  expect(bytes).toEqual(Buffer.from(hostedAttachments.valid.base64, 'base64'));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(hostedAttachments.valid.hash);
  expect(await isDesktopAttachmentPresent(assetsDir, validKey)).toBe(true);
  for (const name of ['corrupt', 'missing', 'failed']) {
    const key = `${hostedAttachments[name].hash}.png`;
    await expect(transferAttachmentBlocks({ storageKey: key, source, destination: receiver }))
      .rejects.toThrow(name === 'corrupt' ? 'attachment_source_invalid' : 'attachment_source_missing');
    expect(await isDesktopAttachmentPresent(assetsDir, key)).toBe(false);
  }
  expect(destination.prepare('SELECT hash,available FROM framed_sync_resource_availability').all())
    .toEqual([{ hash: hostedAttachments.valid.hash, available: 1 }]);
  await prepareIosHostedRequestResources(sourcePaths.databasePath);
  expect(fs.readFileSync(path.join(sourcePaths.assetsDir, validKey))).toEqual(bytes);
});
