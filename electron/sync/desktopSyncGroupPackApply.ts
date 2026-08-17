import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { hasSourceOwnershipSyncFeature, isKnownMobileSyncDeviceKind } from '../../lib/platform/syncAdvertisedFeatures.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { recordObservedSyncGroupFeatures } from '../database/syncGroupMemberFeatures.js';

import type { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupHttp.js';
import { readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';
import { extractSyncPackDatabase } from './syncPackContainerReader.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

type Peer = {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  peer_device_id: string;
  peer_device_kind?: string;
};

type ApplyResult = Awaited<ReturnType<typeof applySyncPackNodeSurfaceWithDbPort>>;

export function assertSourceOwnershipPackCompatible(peerKind: unknown, advertisedFeatures: unknown) {
  if (!isKnownMobileSyncDeviceKind(peerKind) && !hasSourceOwnershipSyncFeature(advertisedFeatures)) {
    throw new Error('sync_pack_source_ownership_feature_missing');
  }
}

export async function collectSyncPackAppliedEvent(port: DbPort, result: ApplyResult) {
  if (!result.applied) return { appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
  const nodes = await port.query<{ id: string }>('SELECT id FROM inc.nodes');
  const objects = await port.query<{ object_id: string; object_type: string }>(
    'SELECT object_id, object_type FROM inc.sync_objects'
  );
  return {
    appliedNodeIds: [...new Set(nodes.map((row) => row.id))],
    appliedObjectIds: [...new Set(objects.map((row) => `${row.object_type}:${row.object_id}`))],
    appliedReviewOpIds: result.appliedReviewOpIds
  };
}

export async function downloadAndApplyDesktopSyncGroupPack(args: {
  after: number;
  createHeaders: typeof createDesktopSyncGroupSignedHeaders;
  peer: Peer;
}) {
  const pathWithQuery = `/companion/sync-pack?after_state_seq=${args.after}`;
  const key = loadDesktopWorkgroupKey(args.peer.group_id);
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  const response = await fetch(`${args.peer.endpoint_url}${pathWithQuery}`, {
    headers: args.createHeaders({ groupId: args.peer.group_id, localDeviceId: args.peer.local_device_id,
      method: 'GET', pathWithQuery, secret: key.group_key })
  });
  const body = await readDesktopWorkgroupResponse({
    contentType: 'application/zip', groupId: args.peer.group_id,
    method: 'GET', pathWithQuery, response
  });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-initial-sync-'));
  try {
    return await applyDownloadedPack(args, body, tempRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function applyDownloadedPack(
  args: Parameters<typeof downloadAndApplyDesktopSyncGroupPack>[0],
  body: Buffer,
  tempRoot: string
) {
  const incomingPath = path.join(tempRoot, 'incoming.db');
  const manifest = await extractSyncPackDatabase({
    body, expectedPeerId: args.peer.local_device_id,
    expectedSourcePeerId: args.peer.peer_device_id, outputPath: incomingPath
  });
  const driver = openDatabaseConnection().driver;
  recordObservedSyncGroupFeatures(driver, args.peer.peer_device_id, manifest.advertisedFeatures);
  assertSourceOwnershipPackCompatible(args.peer.peer_device_kind, manifest.advertisedFeatures);
  if (manifest.toStateSeq < args.after) throw new Error('sync_pack_provider_frontier_rollback');
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-group-pack-apply' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  let event;
  try {
    const result = await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: args.after, deviceId: args.peer.local_device_id,
      incomingAlias: 'inc', sourcePeerId: args.peer.peer_device_id
    });
    event = await collectSyncPackAppliedEvent(port, result);
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  notifyWorkspaceSyncApplied(event);
  return manifest.toStateSeq;
}
