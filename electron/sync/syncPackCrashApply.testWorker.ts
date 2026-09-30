import Database from 'better-sqlite3';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { assertSyncPackManifestMatchesDatabase, parseSyncPackManifest } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

const [targetPath, incomingPath, sourcePeerId, mode] = process.argv.slice(2);
if (!targetPath || !incomingPath || !sourcePeerId) throw new Error('crash_worker_arguments_required');
const db = new Database(targetPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
const actual = createBetterSqliteDbPort(db);
function kill() {
  process.kill(process.pid, 'SIGKILL');
  throw new Error('sigkill_did_not_terminate');
}
const port: DbPort = {
  ...actual,
  transaction<T>(execute: (tx: DbPort) => Promise<T>) {
    return actual.transaction(async (tx) => {
      const result = await execute(tx);
      if (mode === 'before') kill();
      return result;
    });
  }
};
try {
  await port.run('ATTACH DATABASE ? AS inc', [incomingPath]);
  const [stored] = await port.query<{ value: string }>(
    "SELECT value FROM inc.pack_manifest WHERE key = 'manifest_json'");
  if (!stored) throw new Error('invalid_sync_pack_manifest');
  const manifest = parseSyncPackManifest(JSON.parse(stored.value));
  await assertSyncPackManifestMatchesDatabase(port, manifest);
  const cursor = db.prepare('SELECT cursor_state_seq FROM sync_pack_receive_progress WHERE peer_id=?')
    .pluck().get(sourcePeerId) as number | undefined;
  const result = await applySyncPackNodeSurfaceWithDbPort(port, {
    currentCursor: cursor ?? 0, hostName: 'receiver', sourcePeerId,
    enqueueSearchInvalidations: false, recordVersionReceipt: true
  });
  if (mode === 'after') kill();
  process.stdout.write(JSON.stringify(result));
} finally {
  db.close();
}
