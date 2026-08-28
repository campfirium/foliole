import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { hostedProviderLifecyclePassed } from './ios-hosted-provider-evidence.mjs';

export function resolveAcceptanceScenario(value) {
  if (!value || value === 'sync-group-signed-transport') return 'sync-group-signed-transport';
  if ([
    'content-resource-read', 'database-upgrade-runtime', 'foreground-sync-lifecycle',
    'state-writeback-runtime', 'device-identity', 'sync-pack-runtime', 'sync-group-discovery-events',
    'sync-trigger-runtime'
  ].includes(value)) {
    return value;
  }
  throw new Error(`Unknown iOS acceptance scenario: ${value}`);
}

export function parseSyncPackSnapshot(output, cacheEntries = []) {
  const [row] = JSON.parse(output || '[]');
  return {
    cache_entries: [...cacheEntries].sort(),
    capture_current: row?.capture_current ?? null,
    capture_versions: Number(row?.capture_versions ?? 0),
    confirmed_node_delivery_count: Number(row?.confirmed_node_delivery_count ?? 0),
    cursor: Number(row?.cursor ?? -1),
    dirty_count: Number(row?.dirty_count ?? -1),
    push_ack_count: Number(row?.push_ack_count ?? -1),
    restore_current: row?.restore_current ?? null,
    restore_deleted_at: row?.restore_deleted_at ?? null,
    restore_versions: Number(row?.restore_versions ?? 0),
    tombstone_count: Number(row?.tombstone_count ?? -1)
  };
}

export function readSyncPackSnapshot(options) {
  const databasePath = path.join(options.containerPath, options.databaseRelativePath);
  const sql = `SELECT
    (SELECT current_version_id FROM nodes WHERE title = 'Mac successor acceptance') AS capture_current,
    (SELECT count(*) FROM node_sync_versions WHERE object_id =
      (SELECT id FROM nodes WHERE title = 'Mac successor acceptance')) AS capture_versions,
    (SELECT count(*) FROM nodes WHERE id IN (
      'ios-acceptance-restore', (SELECT id FROM nodes WHERE title = 'Mac successor acceptance')
    ) AND sync_dirty <> 0) AS dirty_count,
    (SELECT count(*) FROM sync_delivery_receipts WHERE stream_name = 'node_version'
      AND status = 'confirmed' AND object_id IN (
        'ios-acceptance-restore', (SELECT id FROM nodes WHERE title = 'Mac successor acceptance')
      )) AS confirmed_node_delivery_count,
    (SELECT count(*) FROM sync_delivery_receipts WHERE status <> 'confirmed') AS push_ack_count,
    (SELECT current_version_id FROM nodes WHERE id = 'ios-acceptance-restore') AS restore_current,
    (SELECT deleted_at FROM nodes WHERE id = 'ios-acceptance-restore') AS restore_deleted_at,
    (SELECT count(*) FROM node_sync_versions WHERE object_id = 'ios-acceptance-restore') AS restore_versions,
    (SELECT count(*) FROM node_sync_tombstones WHERE node_id IN (
      'ios-acceptance-restore', (SELECT id FROM nodes WHERE title = 'Mac successor acceptance')
    )) AS tombstone_count,
    (SELECT MAX(CAST(cursor_value AS INTEGER)) FROM sync_peer_cursors
      WHERE stream_name = 'sync-pack-receive') AS cursor;`;
  const cachePath = path.join(options.containerPath, 'Library/Caches/sync-packs');
  const cacheEntries = existsSync(cachePath) ? readdirSync(cachePath) : [];
  return parseSyncPackSnapshot(options.capture('sqlite3', ['-json', databasePath, sql]), cacheEntries);
}

export function verifySyncPackAcceptance(
  firstBridge, secondBridge, firstSnapshot, secondSnapshot, rejections = [], observations = {}
) {
  const firstPassed = firstBridge.phase === 'applied' && firstBridge.apply?.to_state_seq === 1 &&
    firstBridge.roundtrip?.push?.pushedObjectIds?.length === 2 && gatesClosed(firstBridge.roundtrip?.gates);
  const secondPassed = secondBridge.phase === 'reapplied' &&
    secondBridge.roundtrip?.push?.pushedObjectIds?.length === 0 && gatesClosed(secondBridge.roundtrip?.gates);
  const snapshotPassed = firstSnapshot?.capture_versions === 2 && firstSnapshot?.restore_versions === 2 &&
    firstSnapshot?.confirmed_node_delivery_count === 2 && firstSnapshot?.dirty_count === 0 &&
    firstSnapshot?.restore_deleted_at === null && firstSnapshot?.tombstone_count === 0 &&
    firstSnapshot?.cursor > 2 && firstSnapshot?.cache_entries?.length === 0;
  const rejectionKinds = rejections.map(({ bridge }) => bridge.rejection);
  const rejectionSnapshotsStable = rejections.every(({ before, after }) =>
    JSON.stringify(before) === JSON.stringify(firstSnapshot) && JSON.stringify(after) === JSON.stringify(firstSnapshot));
  const service = observations.sync_pack ?? {};
  const serviceObserved = hostedProviderLifecyclePassed(observations) &&
    service.push_requests === 1 && service.ack_statuses?.length === 2 &&
    service.ack_statuses.every((status) => status === 'accepted') &&
    service.pushed_node_ids?.includes('ios-acceptance-restore') &&
    service.pushed_node_ids?.includes(service.capture_node_id);
  if (!firstPassed || !secondPassed || !snapshotPassed || !serviceObserved ||
      JSON.stringify(secondSnapshot) !== JSON.stringify(firstSnapshot) || !rejectionSnapshotsStable ||
      JSON.stringify(rejectionKinds) !== JSON.stringify([
        'corrupt-envelope', 'wrong-target', 'cursor-gap', 'legacy-format', 'illegal-dag'
      ])) {
    throw new Error('iOS Sync Pack acceptance evidence is incomplete.');
  }
  return {
    first: firstBridge, first_snapshot: firstSnapshot, rejections,
    second: secondBridge, second_snapshot: secondSnapshot
  };
}

function gatesClosed(gates) {
  return gates && Object.keys(gates).length === 5 && Object.values(gates).every((value) => value === false);
}

export async function runSyncPackRejections(options) {
  const evidence = [];
  for (const rejection of ['corrupt-envelope', 'wrong-target', 'cursor-gap', 'legacy-format', 'illegal-dag']) {
    const before = options.readSnapshot();
    options.removeBridgeResult();
    const bridge = await options.launchAndReadBridge();
    options.terminate();
    if (bridge.phase !== 'rejected' || bridge.rejection !== rejection) {
      throw new Error(`iOS Sync Pack ${rejection} rejection evidence is incomplete.`);
    }
    evidence.push({ after: options.readSnapshot(), before, bridge });
  }
  return evidence;
}
