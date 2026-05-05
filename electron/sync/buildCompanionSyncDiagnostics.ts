import type {
  SyncDiagnosticConnection,
  SyncDiagnosticSnapshot,
  SyncDiagnosticStorage,
  SyncDiagnosticVerdict
} from '../../lib/platform/syncDiagnosticsContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { loadMaxStateSeq } from '../database/syncPackRows.js';

import type { LanWorkspaceSyncServerStatus } from './lanWorkspaceSyncServer.js';

interface CountRow extends Record<string, unknown> {
  count: number;
}

interface StateCountRow extends Record<string, unknown> {
  count: number;
  max_state_seq: number | null;
  min_state_seq: number | null;
  object_type: string;
}

function count(sql: string) {
  return Number(openDatabaseConnection().driver.queryOne<CountRow>(sql, [])?.count ?? 0);
}

function loadStorage(): SyncDiagnosticStorage {
  return {
    active_node_count: count('SELECT COUNT(*) AS count FROM nodes WHERE deleted_at IS NULL'),
    content_blob_count: count('SELECT COUNT(*) AS count FROM content_blobs'),
    external_document_count: count('SELECT COUNT(*) AS count FROM external_documents'),
    missing_node_state_count: count(`
      SELECT COUNT(*) AS count FROM nodes n
      LEFT JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
      WHERE n.deleted_at IS NULL AND s.object_id IS NULL
    `),
    missing_node_version_count: count(`
      SELECT COUNT(*) AS count FROM nodes n
      WHERE n.deleted_at IS NULL AND (n.current_version_id IS NULL OR n.current_version_id = '')
    `),
    node_blob_references_missing_rows: count(`
      SELECT COUNT(*) AS count FROM nodes n
      LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
      WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL AND cb.hash IS NULL
    `)
  };
}

function loadStateCounts() {
  return openDatabaseConnection().driver.queryAll<StateCountRow>(`
    SELECT object_type, COUNT(*) AS count, MIN(state_seq) AS min_state_seq, MAX(state_seq) AS max_state_seq
    FROM sync_object_state
    GROUP BY object_type
    ORDER BY object_type ASC
  `, []);
}

function buildConnection(status: LanWorkspaceSyncServerStatus | null): SyncDiagnosticConnection {
  return {
    endpoint_url: status?.advertised_urls[0] ?? null,
    last_error: status?.last_error ?? null,
    paired_device_count: status?.paired_device_count ?? 0,
    pending_pair_request_count: status?.pending_pair_request_count ?? 0,
    port: status?.port ?? null,
    state: status?.state ?? 'missing'
  };
}

function buildVerdicts(args: {
  connection: SyncDiagnosticConnection;
  maxStateSeq: number | null;
  storage: SyncDiagnosticStorage;
}): SyncDiagnosticVerdict[] {
  const verdicts: SyncDiagnosticVerdict[] = [];
  if (args.connection.state !== 'running') {
    verdicts.push({
      code: 'desktop_sync_server_not_running',
      evidence: { state: args.connection.state, port: args.connection.port },
      message: 'Desktop sync server is not running.',
      severity: 'error'
    });
  }
  if (args.storage.missing_node_state_count > 0) {
    verdicts.push({
      code: 'desktop_has_nodes_missing_state_rows',
      evidence: { count: args.storage.missing_node_state_count },
      message: 'Some desktop topics are missing sync state rows.',
      severity: 'error'
    });
  }
  if (args.storage.missing_node_version_count > 0) {
    verdicts.push({
      code: 'desktop_has_nodes_missing_versions',
      evidence: { count: args.storage.missing_node_version_count },
      message: 'Some desktop topics are missing version records.',
      severity: 'warning'
    });
  }
  if (args.storage.node_blob_references_missing_rows > 0) {
    verdicts.push({
      code: 'desktop_has_node_blob_references_missing_rows',
      evidence: { count: args.storage.node_blob_references_missing_rows },
      message: 'Some desktop topics reference missing content blob rows.',
      severity: 'error'
    });
  }
  if (args.maxStateSeq === null || args.maxStateSeq <= 0) {
    verdicts.push({
      code: 'desktop_no_state_rows',
      evidence: { max_state_seq: args.maxStateSeq },
      message: 'Desktop has no sync state rows to export.',
      severity: 'warning'
    });
  }
  if (verdicts.length === 0) {
    verdicts.push({
      code: 'desktop_ready',
      evidence: { active_node_count: args.storage.active_node_count, max_state_seq: args.maxStateSeq },
      message: 'Desktop sync state is readable.',
      severity: 'ok'
    });
  }
  return verdicts;
}

export function buildCompanionSyncDiagnostics(args: {
  appVersion: string | null;
  serverStatus: LanWorkspaceSyncServerStatus | null;
}): SyncDiagnosticSnapshot {
  const collectedAt = new Date().toISOString();
  const storage = loadStorage();
  const maxStateSeq = loadMaxStateSeq();
  const connection = buildConnection(args.serverStatus);
  return {
    collected_at: collectedAt,
    connection,
    content: {
      missing_attachment_resource_count: 0,
      missing_content_blob_count: storage.node_blob_references_missing_rows
    },
    events: [],
    host: 'desktop',
    identity: {
      app_version: args.appVersion,
      database_path: openDatabaseConnection().dbPath,
      device_id: loadOrCreateDesktopDeviceId(collectedAt)
    },
    storage,
    sync_state: {
      local_dirty_count: count('SELECT COUNT(*) AS count FROM sync_object_state WHERE sync_dirty = 1'),
      max_state_seq: maxStateSeq > 0 ? maxStateSeq : null,
      pack_cursor: null,
      state_counts: loadStateCounts()
    },
    verdicts: buildVerdicts({ connection, maxStateSeq, storage })
  };
}
