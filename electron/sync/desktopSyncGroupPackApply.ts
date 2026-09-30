import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { dependencyResumeUrl, loadSyncPackDependencyResume,
  retireSyncPackDependencyView } from '../../lib/core/sync/syncPackDependencyResume.js';
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
import { fetchDesktopSyncGroupPackBody } from './desktopSyncGroupPackDownload.js';
import { assertPackRound } from './desktopSyncGroupPackRound.js';
import { applyDesktopRestorePage } from './desktopSyncGroupRestoreApply.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';
import { decryptDesktopWorkgroupResponseFile } from './workgroupAeadFileNode.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export { DESKTOP_SYNC_GROUP_STRUCTURE_TIMEOUT_MS,
  fetchDesktopSyncGroupPackBody } from './desktopSyncGroupPackDownload.js';

type Peer = {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  peer_device_id: string;
  peer_device_name?: string;
};

type ApplyResult = Awaited<ReturnType<typeof applySyncPackNodeSurfaceWithDbPort>>;

export async function collectSyncPackAppliedEvent<T extends Pick<ApplyResult,
  'applied' | 'appliedTombstoneNodeIds' | 'appliedReviewOpIds'>>(port: DbPort, result: T) {
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
    const resume = await runWithDatabaseConnectionOwner(() => loadSyncPackDependencyResume(
      createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
        groupId: args.peer.group_id, peerId: args.peer.peer_device_id, fromStateSeq: args.after }));
    if (resume) {
      try {
        const url = new URL(dependencyResumeUrl(`${args.peer.endpoint_url}${pathWithQuery}`, resume));
        const result = await downloadPackSequence(args, key.group_key, tempRoot,
          url.pathname + url.search);
        return { ...result, roundRebased: false };
      } catch (error) {
        if (!String(error).includes('sync_group_http_409:sync_pack_source_view_unavailable')) throw error;
        await runWithDatabaseConnectionOwner(() => retireSyncPackDependencyView(
          createBetterSqliteDbPort(openDatabaseConnection().sqlite), resume.transfer));
      }
    }
    const prepared = await prepareDesktopSyncPackFactRequest({
      after: args.after, endpointUrl: args.peer.endpoint_url,
      ...(args.frontierStateSeq === undefined ? {} : { frontierStateSeq: args.frontierStateSeq }),
      groupId: args.peer.group_id,
      localDeviceId: args.peer.local_device_id, sourcePeerId: args.peer.peer_device_id,
      pathWithQuery, secret: key.group_key,
      ...(args.sourceEpoch === undefined ? {} : { sourceEpoch: args.sourceEpoch })
    });
    const preparedUrl = new URL(prepared.pathWithQuery, args.peer.endpoint_url);
    const sourceEpoch = preparedUrl.searchParams.get('source_epoch') ?? undefined;
    const frontierStateSeq = Number(preparedUrl.searchParams.get('frontier_state_seq'));
    if (!sourceEpoch || !preparedUrl.searchParams.has('frontier_state_seq') ||
        !Number.isSafeInteger(frontierStateSeq)) {
      throw new Error('sync_pack_fact_index_changed');
    }
    if (prepared.roundRebased && args.sourceEpoch && sourceEpoch !== args.sourceEpoch) {
      throw new Error('sync_pack_source_epoch_changed');
    }
    const round = prepared.roundRebased ? { ...args, frontierStateSeq, sourceEpoch } : args;
    const result = await downloadPackSequence(round, key.group_key, tempRoot,
      prepared.pathWithQuery, prepared.factClaims);
    return { ...result, roundRebased: prepared.roundRebased };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function downloadPackSequence(args: Parameters<typeof downloadAndApplyDesktopSyncGroupPack>[0],
  secret: string, tempRoot: string, firstPath: string,
  factClaims?: Awaited<ReturnType<typeof prepareDesktopSyncPackFactRequest>>['factClaims']) {
  let packPath = firstPath;
  for (;;) {
    const encryptedPath = await fetchDesktopSyncGroupPackBody({
      groupId: args.peer.group_id,
      headers: args.createHeaders({ groupId: args.peer.group_id,
        localDeviceId: args.peer.local_device_id,
        method: 'GET', pathWithQuery: packPath, secret }),
      outputPath: path.join(tempRoot, 'encrypted.json'), pathWithQuery: packPath,
      url: `${args.peer.endpoint_url}${packPath}`
    });
    const archivePath = path.join(tempRoot, 'authenticated.zip');
    await decryptDesktopWorkgroupResponseFile({
      contentType: 'application/zip', encryptedPath, groupId: args.peer.group_id,
      maxPlaintextBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes,
      method: 'GET', outputPath: archivePath, pathWithQuery: packPath
    });
    const result = await applyDesktopSyncGroupPack({ ...args,
      ...(factClaims ? { factClaims } : {}) }, archivePath, tempRoot);
    if (!result.dependencyProgress) return result;
    const next = new URL(dependencyResumeUrl(`${args.peer.endpoint_url}${packPath}`,
      result.dependencyProgress));
    packPath = next.pathname + next.search;
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
  if (args.factClaims && !manifest.dependencyPage) assertFactIndexRound(manifest, args.factClaims.index);
  if (manifest.toStateSeq < args.after) throw new Error('sync_pack_provider_frontier_rollback');
  const { cursor, dependencyProgress, event, participatingArticleIds } = await runWithDatabaseConnectionOwner(async () => {
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
      const apply = (database: DbPort, after = args.after) => applySyncPackNodeSurfaceWithDbPort(database, {
        currentCursor: after, hostName,
        ...(args.restoreId ? { expectedRestoreId: args.restoreId } : {}),
        incomingAlias: 'inc', sourceHostName: sourceDeviceName,
        sourcePeerId: args.peer.peer_device_id,
        recordVersionReceipt: true,
        onSettingApplied: materializeDesktopSettingRecord
      });
      const outcome = args.restoreId && !manifest.dependencyPage ? await applyDesktopRestorePage({
        after: args.after, apply, frontierStateSeq: manifest.frontierStateSeq,
        groupId: args.peer.group_id, peerId: args.peer.peer_device_id,
        port, restoreId: args.restoreId
      }) : { result: await apply(port), removedNodeIds: [] as string[] };
      if (args.restoreId && outcome.result.applied && !manifest.dependencyPage) initializeWorkspaceSearchSidecar(openDatabaseConnection(), {
        requireCurrentSource: true
      });
      const result = outcome.result;
      const event = await collectSyncPackAppliedEvent(port, result);
      return {
        cursor: result.toStateSeq,
        dependencyProgress: result.dependencyProgress,
        event: { ...event, appliedNodeIds: [...new Set([
          ...event.appliedNodeIds, ...outcome.removedNodeIds, ...result.participatingArticleIds
        ])] },
        participatingArticleIds: result.participatingArticleIds
      };
    } finally {
      await port.run('DETACH DATABASE inc');
    }
  });
  return { cursor, dependencyProgress, event, frontierStateSeq: manifest.frontierStateSeq,
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
