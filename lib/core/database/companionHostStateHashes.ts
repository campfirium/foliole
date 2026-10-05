import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import {
  buildCanonicalExternalDocumentPayload,
  buildCanonicalExternalFolderPayload
} from '../sync/canonicalExternalResourcePayload.js';
import {
  buildCanonicalSettingSyncPayload,
  buildCanonicalViewStateSyncPayload
} from '../sync/canonicalPrivateStatePayload.js';
import { buildCanonicalSyncTombstone } from '../sync/canonicalSyncTombstone.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

export async function rehashCompanionHostState(db: DbPort, hostName: string) {
  const settings = await db.query<SettingRow>(
    'SELECT key, scope, platform, form_factor, host_name, value_json FROM setting_records WHERE deleted_at IS NULL'
  );
  for (const row of settings) {
    const hash = computeCompanionContentHash(buildCanonicalSettingSyncPayload(row));
    const objectId = `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${row.key}`;
    await db.run('UPDATE setting_records SET content_hash = ? WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?',
      [hash, row.key, row.scope, row.platform, row.form_factor, row.host_name]);
    await updateStateHash(db, 'setting', objectId, hash);
  }
  await rehashExternalResources(db);
  const states = await db.query<{ object_id: string }>(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'view_state' AND object_id LIKE ?",
    [`%:%:%:${hostName}:%`]
  );
  for (const state of states) await rehashViewState(db, state.object_id, hostName);
  const tombstones = await db.query<{ object_id: string; object_type: 'setting' | 'view_state' }>(
    `SELECT object_id, object_type FROM sync_object_state
     WHERE object_type IN ('setting', 'view_state', 'external_document', 'external_folder')
       AND deleted_at IS NOT NULL`
  );
  for (const state of tombstones) await updateStateHash(db, state.object_type, state.object_id,
    computeCompanionContentHash(buildCanonicalSyncTombstone(state.object_id)), true);
}

async function rehashExternalResources(db: DbPort) {
  const documents = await db.query<ExternalDocumentRow>(
    `SELECT document.document_id, document.folder_id, document.relative_path, document.file_name,
       document.extension, document.content_hash, document.title, document.body_blob_hash,
       document.reference_kind, document.reference_json
     FROM external_documents document JOIN sync_object_state state
       ON state.object_type = 'external_document' AND state.object_id = document.document_id
     WHERE state.deleted_at IS NULL`
  );
  for (const row of documents) await updateStateHash(db, 'external_document', row.document_id,
    computeCompanionContentHash(buildCanonicalExternalDocumentPayload(row)));
  const folders = await db.query<ExternalFolderRow>(
    `SELECT folder.id, folder.source_ref, source.host_name, source.host_platform,
       folder.attachment_mode, folder.excluded_dirs_json
     FROM external_search_folders folder JOIN desktop_sources source ON source.source_ref = folder.source_ref
     JOIN sync_object_state state ON state.object_type = 'external_folder' AND state.object_id = folder.id
     WHERE state.deleted_at IS NULL`
  );
  for (const row of folders) await updateStateHash(db, 'external_folder', row.id,
    computeCompanionContentHash(buildCanonicalExternalFolderPayload(row)));
}

async function rehashViewState(db: DbPort, objectId: string, hostName: string) {
  const [scope, platform, formFactor, , ...keyParts] = objectId.split(':');
  const key = keyParts.join(':');
  if (!scope || !platform || !formFactor || !key) return;
  const base = { form_factor: formFactor, host_name: hostName, key, platform, scope };
  if (key === 'active_node') {
    const [row] = await db.query<{ value: string }>("SELECT value FROM workspace_meta WHERE key = 'active_node_id'");
    await updateStateHash(db, 'view_state', objectId,
      computeCompanionContentHash(buildCanonicalViewStateSyncPayload({
        ...base, active_node_id: row?.value ?? null
      })));
    return;
  }
  if (!key.startsWith('node:')) return;
  const [row] = await db.query<ViewRow>(
    'SELECT node_id, scroll_top, selection_from, selection_to FROM node_view_state WHERE node_id = ? AND host_name = ?',
    [key.slice(5), hostName]
  );
  if (row) await updateStateHash(db, 'view_state', objectId,
    computeCompanionContentHash(buildCanonicalViewStateSyncPayload({ ...base, ...row })));
}

async function updateStateHash(
  db: DbPort, type: string, objectId: string, hash: string, deleted = false
) {
  await db.run(`UPDATE sync_object_state SET
    base_content_hash = CASE WHEN sync_dirty = 1 THEN COALESCE(base_content_hash, content_hash)
                             ELSE content_hash END,
    content_hash = ?, state_seq = ${NEXT_SYNC_STATE_SEQ_SQL}, sync_dirty = 1
    WHERE object_type = ? AND object_id = ? AND deleted_at IS ${deleted ? 'NOT ' : ''}NULL
      AND content_hash IS NOT ?`,
  [hash, type, objectId, hash]);
}

export function computeCompanionContentHash(value: unknown) {
  return bytesToHex(sha256(new TextEncoder().encode(stableJson(value))));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

interface SettingRow extends DbRow {
  form_factor: string; host_name: string; key: string; platform: string; scope: string; value_json: string;
}

interface ViewRow extends DbRow {
  node_id: string; scroll_top: number; selection_from: number | null; selection_to: number | null;
}

interface ExternalDocumentRow extends DbRow {
  body_blob_hash: string | null; content_hash: string; document_id: string; extension: string;
  file_name: string; folder_id: string; reference_json: string | null; reference_kind: string;
  relative_path: string; title: string;
}

interface ExternalFolderRow extends DbRow {
  attachment_mode: string; excluded_dirs_json: string; host_name: string; host_platform: string;
  id: string; source_ref: string;
}
