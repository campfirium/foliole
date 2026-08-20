import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort, DbRow } from '../sync/dbPort.js';

export async function rehashCompanionHostState(db: DbPort, hostName: string) {
  const settings = await db.query<SettingRow>(
    'SELECT key, scope, platform, form_factor, host_name, value_json FROM setting_records'
  );
  for (const row of settings) {
    const hash = computeCompanionContentHash(row);
    const objectId = `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${row.key}`;
    await db.run('UPDATE setting_records SET content_hash = ? WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?',
      [hash, row.key, row.scope, row.platform, row.form_factor, row.host_name]);
    await updateStateHash(db, 'setting', objectId, hash);
  }
  const states = await db.query<{ object_id: string }>(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'view_state' AND object_id LIKE ?",
    [`%:%:%:${hostName}:%`]
  );
  for (const state of states) await rehashViewState(db, state.object_id, hostName);
}

async function rehashViewState(db: DbPort, objectId: string, hostName: string) {
  const [scope, platform, formFactor, , ...keyParts] = objectId.split(':');
  const key = keyParts.join(':');
  if (!scope || !platform || !formFactor || !key) return;
  const base = { form_factor: formFactor, host_name: hostName, key, platform, scope };
  if (key === 'active_node') {
    const [row] = await db.query<{ value: string }>("SELECT value FROM workspace_meta WHERE key = 'active_node_id'");
    await updateStateHash(db, 'view_state', objectId,
      computeCompanionContentHash({ ...base, active_node_id: row?.value ?? null }));
    return;
  }
  if (!key.startsWith('node:')) return;
  const [row] = await db.query<ViewRow>(
    'SELECT node_id, scroll_top, selection_from, selection_to FROM node_view_state WHERE node_id = ? AND host_name = ?',
    [key.slice(5), hostName]
  );
  if (row) await updateStateHash(db, 'view_state', objectId, computeCompanionContentHash({ ...base, ...row }));
}

async function updateStateHash(db: DbPort, type: string, objectId: string, hash: string) {
  await db.run('UPDATE sync_object_state SET content_hash = ?, sync_dirty = 1 WHERE object_type = ? AND object_id = ?',
    [hash, type, objectId]);
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
