import { randomUUID } from 'node:crypto';

import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import type { Dive } from '../../lib/core/nodes/dive.js';

import type { SqliteDatabase } from './connection.js';

const prefix = 'dive:';

function decodeDive(key: string, value: string): Dive {
  const record = JSON.parse(value) as { version: number; title: string; directSourceIds: string[] };
  if (record.version !== 1 || typeof record.title !== 'string' ||
      !Array.isArray(record.directSourceIds) || record.directSourceIds.some((id) => typeof id !== 'string')) {
    throw new Error('Invalid Dive record');
  }
  return { id: key.slice(prefix.length), title: record.title, directSourceIds: record.directSourceIds };
}

export function listDives(db: SqliteDatabase): Dive[] {
  const rows = db.prepare("SELECT key, value FROM workspace_meta WHERE key >= 'dive:' AND key < 'dive;'")
    .all() as { key: string; value: string }[];
  return rows.map(({ key, value }) => decodeDive(key, value))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function validateSources(db: SqliteDatabase, ids: readonly string[]): string[] {
  if (!ids.length) throw new Error('Choose at least one Dive source');
  const eligible = db.prepare(`SELECT 1 FROM nodes WHERE id = ? AND deleted_at IS NULL
    AND kind IN ('topic', 'folder') AND virtual_filter IS NULL
    AND id NOT IN (?, ?, ?, ?) AND COALESCE(parent_id, '') <> ?`);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.some((id) => !eligible.get(id, HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID, VIRTUAL_ROOT_NODE_ID))) throw new Error('A Dive source is unavailable');
  return uniqueIds;
}

function encodeDive(dive: Dive) {
  return JSON.stringify({ version: 1, title: dive.title, directSourceIds: dive.directSourceIds });
}

export function createDive(db: SqliteDatabase, name: string, ids: readonly string[]): Dive {
  const title = name.trim();
  if (!title || title.length > 120) throw new Error('Invalid Dive name');
  return db.transaction(() => {
    const dive = { id: randomUUID(), title, directSourceIds: validateSources(db, ids) };
    db.prepare('INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)')
      .run(prefix + dive.id, encodeDive(dive), new Date().toISOString());
    return dive;
  }).immediate();
}

export function addDiveSources(db: SqliteDatabase, diveId: string, ids: readonly string[]): Dive {
  return db.transaction(() => {
    const key = prefix + diveId;
    const row = db.prepare('SELECT value FROM workspace_meta WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) throw new Error('Dive is unavailable');
    const dive = decodeDive(key, row.value);
    const directSourceIds = [...new Set([...dive.directSourceIds, ...validateSources(db, ids)])];
    if (directSourceIds.length === dive.directSourceIds.length) return dive;
    const updated = { ...dive, directSourceIds };
    db.prepare('UPDATE workspace_meta SET value = ?, updated_at = ? WHERE key = ?')
      .run(encodeDive(updated), new Date().toISOString(), key);
    return updated;
  }).immediate();
}
