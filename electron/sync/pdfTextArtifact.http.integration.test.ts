// @vitest-environment node
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { missingPdfTextArtifacts } from '../../lib/core/sync/pdfTextArtifact.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { importCompanionPdfTextArtifact } from '../../src/shared/platform/companion/sync/framed/companionPdfTextArtifact.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance,
  runWithDatabaseConnectionOwner } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

it('transfers PDF text over authenticated resumable attachments and imports it once without page inventory', async () => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const pdf = Buffer.from('PDF resource'); const hash = createHash('sha256').update(pdf).digest('hex');
  const key = `${hash}.pdf`;
  const local = await attachmentHttpSource([key], directory.root);
  await seedAttachmentTarget([key]);
  await writeFile(path.join(resolveRuntimeDataPaths().assetsDir, key), pdf);
  const text = 'Searchable Unicode 文字 '.repeat(50000);
  await runWithDatabaseConnectionOwner(async () => {
    const { sqlite } = openDatabaseConnection();
    sqlite.prepare("INSERT INTO pdf_index_state(attachment_id, status, version) VALUES (?, 'ready', 1)").run(hash);
    sqlite.prepare('INSERT INTO pdf_page_text VALUES (?, 1, ?, 600, 800)').run(hash, text);
  });
  const needs = local.host.needsSlice.bind(local.host);
  local.host.needsSlice = async shouldYield => ({ ...await needs(shouldYield),
    pdfTextKeys: await local.database.readSnapshot(db => missingPdfTextArtifacts(db, [key])) });
  local.host.importPdfText = (pdf, artifact) => importCompanionPdfTextArtifact(local.database, local.host, pdf, artifact);
  let artifactBlocks = 0;
  const receive = local.host.receive.bind(local.host);
  local.host.receive = async (resource, offset, bytes) => {
    const result = await receive(resource, offset, bytes);
    if (resource.storageKey.endsWith('.pdftext')) artifactBlocks++;
    return result;
  };
  const server = await attachmentHttpServer(0); const owner = createSyncPeerRoundOwnership(60_000);
  try {
    let completed = false;
    for (let round = 0; round < 10 && !completed; round++) {
      const id = crypto.randomUUID(); const lease = owner.acquireOutbound('local', id);
      if (!lease) throw new Error('test_round_busy');
      const peerRound = { id, lease, admitted: false };
      const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl: server.url, groupKey: attachmentGroupKey,
        groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
        context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
          initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
      try {
        const result = await withRequestSyncPeerRound(exchange, peerRound,
          () => exchangeRequestSyncAttachments(local.host, exchange, (_key, error) => { throw error; }, () => round === 0 && artifactBlocks > 0));
        if (round === 0) {
          expect(result.pending).toBeGreaterThan(0);
          expect(local.sqlite.prepare('SELECT COUNT(*) count FROM pdf_page_text').get()).toEqual({ count: 0 });
        }
        completed = result.pending === 0;
      } finally { lease.release(); }
    }
    expect(completed).toBe(true);
    expect(local.sqlite.prepare('SELECT text, page_width, page_height FROM pdf_page_text').get())
      .toEqual({ text, page_width: 600, page_height: 800 });
    expect(local.sqlite.prepare('SELECT COUNT(*) count FROM pdf_text_artifact').get()).toEqual({ count: 1 });
    expect(local.sqlite.prepare("SELECT COUNT(*) count FROM sync_object_state WHERE object_type = 'pdf_page_text'").get()).toEqual({ count: 0 });
    expect((await local.host.needsSlice(() => false)).pdfTextKeys).toEqual([]);
  } finally {
    owner.close(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
}, 60_000);
