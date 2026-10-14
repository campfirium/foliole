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

export function parseSyncPackSnapshot(output) {
  const [row] = JSON.parse(output || '[]');
  return row ?? null;
}

export function readSyncPackSnapshot(options) {
  const databasePath = path.join(options.containerPath, options.databaseRelativePath);
  const sql = `SELECT
    (SELECT current_version_id FROM nodes WHERE title = 'Mac successor acceptance') AS capture_current,
    (SELECT content FROM nodes WHERE title = 'Mac successor acceptance') AS capture_body,
    (SELECT count(*) FROM node_sync_versions WHERE object_id =
      (SELECT id FROM nodes WHERE title = 'Mac successor acceptance')) AS capture_versions,
    (SELECT parent_version_id FROM node_sync_version_parents WHERE version_id =
      'ver_00000000-0000-4000-8000-000000000148') AS capture_parent,
    (SELECT current_version_id FROM nodes WHERE id = 'ios-acceptance-restore') AS restore_current,
    (SELECT content FROM nodes WHERE id = 'ios-acceptance-restore') AS restore_body,
    (SELECT deleted_at FROM nodes WHERE id = 'ios-acceptance-restore') AS restore_deleted_at,
    (SELECT count(*) FROM node_sync_versions WHERE object_id = 'ios-acceptance-restore') AS restore_versions,
    (SELECT parent_version_id FROM node_sync_version_parents WHERE version_id =
      'ver_00000000-0000-4000-8000-000000000147') AS restore_parent,
    (SELECT count(*) FROM node_sync_tombstones WHERE node_id IN (
      'ios-acceptance-restore', (SELECT id FROM nodes WHERE title = 'Mac successor acceptance')
    )) AS tombstone_count;`;
  return parseSyncPackSnapshot(options.capture('sqlite3', ['-json', databasePath, sql]));
}

export function verifySyncPackAcceptance(
  firstBridge, secondBridge, firstSnapshot, secondSnapshot, observations = {}
) {
  const service = observations.sync_pack ?? {};
  const pushed = new Set(firstBridge.roundtrip?.push?.pushedObjectIds ?? []);
  const firstPassed = firstBridge.phase === 'applied' && firstBridge.apply?.remainingStructureChangeCount === 0 &&
    pushed.has(service.capture_node_id) && pushed.has('ios-acceptance-restore') && gatesOpen(firstBridge.roundtrip?.gates);
  const secondPassed = secondBridge.phase === 'reapplied' &&
    secondBridge.roundtrip?.push?.pushedObjectIds?.length === 0 && gatesOpen(secondBridge.roundtrip?.gates);
  const version = suffix => `ver_00000000-0000-4000-8000-000000000${suffix}`;
  const snapshotPassed = firstSnapshot?.capture_versions === 2 && firstSnapshot?.restore_versions === 2 &&
    firstSnapshot?.capture_current === version('148') && firstSnapshot?.capture_parent === version('146') &&
    firstSnapshot?.capture_body === 'Mac successor body' && firstSnapshot?.restore_body === 'Restore body' &&
    firstSnapshot?.restore_current === version('147') && firstSnapshot?.restore_parent === version('145') &&
    firstSnapshot?.restore_deleted_at === null && firstSnapshot?.tombstone_count === 0;
  const serviceObserved = hostedProviderLifecyclePassed(observations) && Boolean(service.capture_node_id) &&
    service.received_version_ids?.includes(version('146')) && service.received_version_ids?.includes(version('147')) &&
    service.successor_version_id === version('148');
  if (!firstPassed || !secondPassed || !snapshotPassed || !serviceObserved ||
      JSON.stringify(secondSnapshot) !== JSON.stringify(firstSnapshot)) {
    throw new Error('iOS request sync acceptance evidence is incomplete.');
  }
  return { first: firstBridge, first_snapshot: firstSnapshot, second: secondBridge, second_snapshot: secondSnapshot };
}

function gatesOpen(gates) {
  return gates && Object.keys(gates).length === 5 && Object.values(gates).every((value) => value === true);
}
