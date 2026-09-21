import fs from 'node:fs';
import path from 'node:path';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectProtectionIdentity } from './android-device-data-protection.mjs';
import { openReadonlySqliteDatabase } from './sqlite-readonly.mjs';
import { assessS220MainChanges, hashS220Fact } from './macos-a5-s220-main-facts.mjs';

const TABLES = ['nodes', 'node_order', 'content_blobs', 'attachments',
  'sync_object_state', 'workspace_meta', 'companion_meta', 'sync_groups',
  'sync_group_devices', 'sync_group_local_state'];

function databaseFacts(database) {
  const nodes = database.prepare('SELECT * FROM nodes ORDER BY id').all();
  const dirty = database.prepare(`SELECT object_type, object_id, state_seq,
      current_version_id, content_hash, sync_dirty
    FROM sync_object_state WHERE sync_dirty = 1 ORDER BY object_type, object_id`).all();
  const deliveries = database.prepare(`SELECT peer_id, status, COUNT(*) AS count
    FROM sync_delivery_receipts GROUP BY peer_id, status ORDER BY peer_id, status`).all();
  const current = database.prepare(`SELECT receipt.peer_id, receipt.status, COUNT(*) AS count
    FROM sync_delivery_receipts receipt JOIN sync_object_state state
      ON state.object_type = receipt.object_type AND state.object_id = receipt.object_id
      AND state.sync_dirty = 1 AND receipt.payload_identity = CASE
        WHEN state.object_type = 'node' THEN state.current_version_id
        ELSE state.content_hash END
    GROUP BY receipt.peer_id, receipt.status ORDER BY receipt.peer_id, receipt.status`).all();
  const deliveryRows = database.prepare(`SELECT peer_id, stream_name, operation_id,
      object_type, object_id, payload_identity, status
    FROM sync_delivery_receipts ORDER BY peer_id, stream_name, operation_id`).all();
  return { nodeCount: nodes.length, nodeRowsHash: hashS220Fact(nodes), dirty,
    deliveries, currentDeliveries: current, deliveryRows };
}

function latestPreparation(paths) {
  const root = path.join(paths.artifactsRoot, 'S220', 'a5-prepare');
  const candidates = fs.readdirSync(root).sort().reverse();
  for (const candidate of candidates) {
    const receiptPath = path.join(root, candidate, 'receipt.json');
    if (fs.existsSync(receiptPath)) return { receiptPath,
      receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')) };
  }
  throw new Error('No completed S220 main backup receipt exists.');
}

export async function compareS220A5Main({ assertFixed, paths, serial,
  collectSnapshot = collectAndroidDeviceSnapshot, openDatabase = openReadonlySqliteDatabase }) {
  assertFixed();
  const { receipt, receiptPath } = latestPreparation(paths);
  if (receipt.serial !== serial || receipt.apkIdentity.appId !== 'com.foliole.android.s220acceptance') {
    throw new Error('S220 baseline identity does not match the fixed device and package.');
  }
  const baseline = JSON.parse(fs.readFileSync(receipt.baseline, 'utf8'));
  const current = await collectSnapshot({ adb: paths.adb, appId: 'com.foliole.android',
    databaseInspector: inspectProtectionIdentity, keepPulledDatabase: true,
    serial, tables: TABLES });
  try {
    if (current.database?.integrity !== 'ok'
      || baseline.snapshot.database?.integrity !== 'ok') {
      throw new Error('S220 main SQLite snapshot is not readable and integral.');
    }
    const beforeDb = await openDatabase(baseline.backup.databasePath);
    const afterDb = await openDatabase(current.database.path);
    let before; let after;
    try { before = databaseFacts(beforeDb); after = databaseFacts(afterDb); }
    finally { beforeDb.close(); afterDb.close(); }
    const assessment = assessS220MainChanges(before, after, baseline.snapshot, current);
    delete before.deliveryRows;
    delete after.deliveryRows;
    const result = { baselineReceipt: receiptPath, checkedAt: new Date().toISOString(),
      ...assessment, before, after, baselineCounts: baseline.snapshot.database.counts,
      currentCounts: current.database.counts,
      attachmentsPreserved: baseline.snapshot.attachments.sha256 === current.attachments.sha256 };
    const filePath = path.join(path.dirname(receiptPath), 'main-compare.json');
    fs.writeFileSync(filePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    if (!assessment.corePreserved || !assessment.expectedDeliveryChanges) {
      throw new Error(`S220 main data changed unexpectedly; inspect ${filePath}`);
    }
    return { filePath, preserved: true, result };
  } finally {
    if (current.database?.path) fs.rmSync(path.dirname(current.database.path),
      { recursive: true, force: true });
  }
}
