import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { assertSyncPackFactClaimsStillHeld,
  type SyncPackFactClaims, type SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { SYNC_PACK_PAGE_CONTRACT } from '../../lib/core/sync/syncPackPageContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { materializeDesktopSettingRecord } from '../database/desktopSettingMaterializer.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { prepareDesktopSyncPackFactRequest } from './desktopSyncGroupFactProbe.js';
import type { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupHttp.js';
import { readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';
import { assertPackRound } from './desktopSyncGroupPackRound.js';
import { applyDesktopRestorePage } from './desktopSyncGroupRestoreApply.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';
import { decryptDesktopWorkgroupResponseFile } from './workgroupAeadFileNode.js';
import { WORKGROUP_ENVELOPE_CONTENT_TYPE } from './workgroupHttpCrypto.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

type Peer = {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  peer_device_id: string;
  peer_device_name?: string;
};

type ApplyResult = Awaited<ReturnType<typeof applySyncPackNodeSurfaceWithDbPort>>;
export const DESKTOP_SYNC_GROUP_STRUCTURE_TIMEOUT_MS = 30_000;

export async function fetchDesktopSyncGroupPackBody(args: {
  headers: Record<string, string>;
  groupId: string;
  pathWithQuery: string;
  outputPath: string;
  timeoutMs?: number;
  url: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    args.timeoutMs ?? DESKTOP_SYNC_GROUP_STRUCTURE_TIMEOUT_MS
  );
  try {
    const response = await fetch(args.url, { headers: args.headers, signal: controller.signal });
    if (!response.ok) await readDesktopWorkgroupResponse({
      contentType: 'application/zip', groupId: args.groupId,
      maxEnvelopeBytes: 1024 * 1024,
      method: 'GET', pathWithQuery: args.pathWithQuery, response
    });
    if (response.headers.get('content-type') !== WORKGROUP_ENVELOPE_CONTENT_TYPE ||
        !response.body) throw new Error('workgroup_aead_response_required');
    const file = await fs.open(args.outputPath, 'w');
    const reader = response.body.getReader();
    try {
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes) {
          throw new Error('sync_pack_encrypted_payload_limit_exceeded');
        }
        await file.writeFile(value);
      }
    } catch (error) {
      try { await reader.cancel(); } catch { /* Preserve the transfer error. */ }
      throw error;
    } finally {
      await file.close();
    }
    return args.outputPath;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('sync_group_structure_pack_timeout', { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectSyncPackAppliedEvent(port: DbPort, result: ApplyResult) {
  if (!result.applied) return {
    appliedNodeIds: result.appliedTombstoneNodeIds,
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
  const nodes = await port.query<{ id: string }>('SELECT id FROM inc.nodes');
  const objects = await port.query<{ object_id: string; object_type: string }>(
    'SELECT object_id, object_type FROM inc.sync_objects'
  );
  return {
    appliedNodeIds: [...new Set([...nodes.map((row) => row.id), ...result.appliedTombstoneNodeIds])],
    appliedObjectIds: [...new Set(objects.map((row) => `${row.object_type}:${row.object_id}`))],
    appliedReviewOpIds: result.appliedReviewOpIds
  };
}

export async function downloadAndApplyDesktopSyncGroupPack(args: {
  after: number;
  createHeaders: typeof createDesktopSyncGroupSignedHeaders;
  frontierStateSeq?: number;
  peer: Peer;
  restoreId?: string;
  sourceEpoch?: string;
}) {
  const key = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(args.peer.group_id));
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-initial-sync-'));
  try {
    const pathWithQuery = `/companion/sync-pack?after_state_seq=${args.after}&page_contract=${SYNC_PACK_PAGE_CONTRACT}` +
      (args.restoreId ? `&restore_id=${encodeURIComponent(args.restoreId)}` : '') +
      (args.frontierStateSeq === undefined ? '' : `&frontier_state_seq=${args.frontierStateSeq}`) +
      (args.sourceEpoch ? `&source_epoch=${encodeURIComponent(args.sourceEpoch)}` : '');
    const prepared = await prepareDesktopSyncPackFactRequest({
      after: args.after, endpointUrl: args.peer.endpoint_url,
      ...(args.frontierStateSeq === undefined ? {} : { frontierStateSeq: args.frontierStateSeq }),
      groupId: args.peer.group_id,
      localDeviceId: args.peer.local_device_id, pathWithQuery, secret: key.group_key,
      ...(args.sourceEpoch === undefined ? {} : { sourceEpoch: args.sourceEpoch })
    });
    const packPath = prepared.pathWithQuery;
    const encryptedPath = await fetchDesktopSyncGroupPackBody({
      groupId: args.peer.group_id,
      headers: args.createHeaders({ groupId: args.peer.group_id,
        localDeviceId: args.peer.local_device_id,
        method: 'GET', pathWithQuery: packPath, secret: key.group_key }),
      outputPath: path.join(tempRoot, 'encrypted.json'), pathWithQuery: packPath,
      url: `${args.peer.endpoint_url}${packPath}`
    });
    const archivePath = path.join(tempRoot, 'authenticated.zip');
    await decryptDesktopWorkgroupResponseFile({
      contentType: 'application/zip', encryptedPath, groupId: args.peer.group_id,
      maxPlaintextBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes,
      method: 'GET', outputPath: archivePath, pathWithQuery: packPath
    });
    return await applyDesktopSyncGroupPack({ ...args, factClaims: prepared.factClaims }, archivePath, tempRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export async function applyDesktopSyncGroupPack(
  args: Pick<Parameters<typeof downloadAndApplyDesktopSyncGroupPack>[0],
    'after' | 'frontierStateSeq' | 'peer' | 'restoreId' | 'sourceEpoch'> & {
      factClaims?: { index: SyncPackFactIndex; claims: SyncPackFactClaims };
    },
  archivePath: string,
  tempRoot: string
) {
  const incomingPath = path.join(tempRoot, 'incoming.db');
  const sourceDeviceName = args.peer.peer_device_name?.trim();
  if (!sourceDeviceName) throw new Error('sync_group_source_device_unavailable');
  const manifest = await extractBoundedIncomingPack(args, archivePath, incomingPath);
  assertPackRound(args, manifest);
  if (args.factClaims) assertFactIndexRound(manifest, args.factClaims.index);
  if (manifest.toStateSeq < args.after) throw new Error('sync_pack_provider_frontier_rollback');
  const { cursor, event, participatingArticleIds } = await runWithDatabaseConnectionOwner(async () => {
    const hostName = loadOrCreateDesktopHostName();
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, {
      name: 'desktop-sync-group-pack-apply'
    });
    await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
    try {
      await assertSyncPackManifestMatchesDatabase(port, manifest);
      if (args.factClaims) {
        await assertSyncPackFactClaimsStillHeld(port, args.factClaims.index, args.factClaims.claims);
      }
      const apply = (database: DbPort) => applySyncPackNodeSurfaceWithDbPort(database, {
        currentCursor: args.after, hostName,
        incomingAlias: 'inc', sourceHostName: sourceDeviceName,
        sourcePeerId: args.peer.peer_device_id,
        recordVersionReceipt: true,
        onSettingApplied: materializeDesktopSettingRecord
      });
      const outcome = args.restoreId ? await applyDesktopRestorePage({
        after: args.after, apply, frontierStateSeq: manifest.frontierStateSeq,
        groupId: args.peer.group_id, peerId: args.peer.peer_device_id,
        port, restoreId: args.restoreId
      }) : { result: await apply(port), removedNodeIds: [] as string[] };
      if (args.restoreId) initializeWorkspaceSearchSidecar(openDatabaseConnection(), {
        requireCurrentSource: true
      });
      const result = outcome.result;
      const event = await collectSyncPackAppliedEvent(port, result);
      return {
        cursor: result.toStateSeq,
        event: { ...event, appliedNodeIds: [...new Set([
          ...event.appliedNodeIds, ...outcome.removedNodeIds
        ])] },
        participatingArticleIds: result.participatingArticleIds
      };
    } finally {
      await port.run('DETACH DATABASE inc');
    }
  });
  return { cursor, event, frontierStateSeq: manifest.frontierStateSeq,
    participatingArticleIds, sourceEpoch: manifest.sourceEpoch };
}

function assertFactIndexRound(manifest: {
  fromStateSeq: number; toStateSeq: number; frontierStateSeq: number; sourceEpoch: string;
}, index: SyncPackFactIndex) {
  if (manifest.fromStateSeq !== index.from_state_seq ||
      manifest.toStateSeq !== index.to_state_seq ||
      manifest.frontierStateSeq !== index.frontier_state_seq ||
      manifest.sourceEpoch !== index.source_epoch) {
    throw new Error('sync_pack_fact_index_changed');
  }
}

async function extractBoundedIncomingPack(
  args: Pick<Parameters<typeof downloadAndApplyDesktopSyncGroupPack>[0], 'peer'>,
  archivePath: string, incomingPath: string
) {
  return extractSyncPackDatabaseFromFile({
    archivePath, expectedPeerId: args.peer.local_device_id,
    expectedSourcePeerId: args.peer.peer_device_id,
    maxDatabaseBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.databaseBytes, outputPath: incomingPath
  });
}
