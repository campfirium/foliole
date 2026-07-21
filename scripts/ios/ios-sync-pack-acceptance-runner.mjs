import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function resolveAcceptanceScenario(value) {
  if (!value || value === 'pairing-signed-transport') return 'pairing-signed-transport';
  if (['content-resource-read', 'database-upgrade-runtime', 'state-writeback-runtime', 'sync-pack-runtime'].includes(value)) {
    return value;
  }
  throw new Error(`Unknown iOS acceptance scenario: ${value}`);
}

export function parseSyncPackSnapshot(output, cacheEntries = []) {
  const [row] = JSON.parse(output || '[]');
  return {
    cache_entries: [...cacheEntries].sort(),
    cursor: Number(row?.cursor ?? -1),
    node_count: Number(row?.node_count ?? 0),
    state_count: Number(row?.state_count ?? 0),
    state_seq: Number(row?.state_seq ?? -1)
  };
}

export function readSyncPackSnapshot(options) {
  const databasePath = path.join(options.containerPath, options.databaseRelativePath);
  const sql = `SELECT
    (SELECT count(*) FROM nodes WHERE id = 'ios-acceptance-node') AS node_count,
    (SELECT count(*) FROM sync_object_state WHERE object_type = 'node' AND object_id = 'ios-acceptance-node') AS state_count,
    (SELECT state_seq FROM sync_object_state WHERE object_type = 'node' AND object_id = 'ios-acceptance-node') AS state_seq,
    (SELECT value FROM companion_meta WHERE key = 'sync_pack_cursor') AS cursor;`;
  const cachePath = path.join(options.containerPath, 'Library/Caches/sync-packs');
  const cacheEntries = existsSync(cachePath) ? readdirSync(cachePath) : [];
  return parseSyncPackSnapshot(options.capture('sqlite3', ['-json', databasePath, sql]), cacheEntries);
}

export function verifySyncPackAcceptance(firstBridge, secondBridge, firstSnapshot, secondSnapshot, rejections = []) {
  const firstPassed = firstBridge.phase === 'applied' && firstBridge.apply?.to_state_seq === 2;
  const secondPassed = secondBridge.phase === 'reapplied' && secondBridge.apply?.to_state_seq === 2;
  const expected = { cache_entries: [], cursor: 2, node_count: 1, state_count: 1, state_seq: 1 };
  const rejectionKinds = rejections.map(({ bridge }) => bridge.rejection);
  const rejectionSnapshotsStable = rejections.every(({ before, after }) =>
    JSON.stringify(before) === JSON.stringify(expected) && JSON.stringify(after) === JSON.stringify(expected));
  if (!firstPassed || !secondPassed || JSON.stringify(firstSnapshot) !== JSON.stringify(expected) ||
      JSON.stringify(secondSnapshot) !== JSON.stringify(expected) || !rejectionSnapshotsStable ||
      JSON.stringify(rejectionKinds) !== JSON.stringify(['corrupt-envelope', 'wrong-target', 'cursor-gap'])) {
    throw new Error('iOS Sync Pack acceptance evidence is incomplete.');
  }
  return {
    first: firstBridge, first_snapshot: firstSnapshot, rejections,
    second: secondBridge, second_snapshot: secondSnapshot
  };
}

export async function runSyncPackRejections(options) {
  const evidence = [];
  for (const rejection of ['corrupt-envelope', 'wrong-target', 'cursor-gap']) {
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
