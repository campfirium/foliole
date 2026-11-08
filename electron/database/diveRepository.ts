import { randomUUID } from 'node:crypto';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';
import { DIVE_NODE_FILTER, readDiveNode, type Dive } from '../../lib/core/nodes/dive.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import type { SqliteDatabase } from './connection.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

const diveRows = `SELECT id, title, virtual_filter, manual_child_order, created_at FROM nodes
  WHERE kind = 'folder' AND parent_id IS NULL AND deleted_at IS NULL AND virtual_filter IS NOT NULL`;

interface DiveRow {
  id: string;
  title: string;
  virtual_filter: string;
  manual_child_order: string | null;
  created_at: string;
}

function decodeDive(row: DiveRow) {
  return readDiveNode({
    id: row.id, title: row.title, kind: 'folder', parentNodeId: null,
    virtualFilter: parseVirtualNodeFilter(row.virtual_filter),
    manualChildOrder: parseManualChildOrder(row.manual_child_order)
  });
}

export function listDives(db: SqliteDatabase): Dive[] {
  return (db.prepare(diveRows).all() as DiveRow[]).flatMap(row => decodeDive(row) ?? [])
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function validateSources(db: SqliteDatabase, ids: readonly string[]): string[] {
  if (!ids.length) throw new Error('Choose at least one Dive source');
  const eligible = db.prepare(`SELECT 1 FROM nodes AS source LEFT JOIN nodes AS parent ON parent.id = source.parent_id
    WHERE source.id = ? AND source.deleted_at IS NULL AND source.virtual_filter IS NULL
    AND (source.kind = 'folder' OR (source.kind = 'topic'
      AND source.anchor_link IS NULL AND (source.parent_id IS NULL OR parent.kind = 'folder')))
    AND source.id NOT IN (?, ?, ?, ?) AND COALESCE(source.parent_id, '') <> ?`);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.some(id => !eligible.get(id, HOME_NODE_ID, INBOX_NODE_ID, TRASH_NODE_ID, VIRTUAL_ROOT_NODE_ID, VIRTUAL_ROOT_NODE_ID))) {
    throw new Error('A Dive source is unavailable');
  }
  return uniqueIds;
}

function validateTitle(name: string) {
  const title = name.trim();
  if (!title || title.length > 120) throw new Error('Invalid Dive name');
  return title;
}

function saveDive(db: SqliteDatabase, dive: Dive, createdAt?: string) {
  const updatedAt = new Date().toISOString();
  const driver = createBetterSqlite3Driver(db);
  const hostName = requireDatabaseHostName(driver);
  upsertNodeSnapshot(driver, {
    nodeId: dive.id, parentNodeId: null, kind: 'folder', hostName,
    title: dive.title, isTitleManual: true, virtualFilter: DIVE_NODE_FILTER,
    manualChildOrder: [...dive.directSourceIds], content: '', anchorLink: null, reveal: null,
    position: null, createdAt: createdAt ?? updatedAt, updatedAt
  });
  flushNodeSyncVersionWithDriver(driver, dive.id, hostName, updatedAt);
  return dive;
}

export function createDive(db: SqliteDatabase, name: string, ids: readonly string[]): Dive {
  const title = validateTitle(name);
  return db.transaction(() => saveDive(db, {
    id: randomUUID(), title, directSourceIds: ids.length ? validateSources(db, ids) : []
  })).immediate();
}

export function renameDive(db: SqliteDatabase, diveId: string, name: string): Dive {
  const title = validateTitle(name);
  return updateDive(db, diveId, dive => dive.title === title ? dive : { ...dive, title });
}

export function addDiveSources(db: SqliteDatabase, diveId: string, ids: readonly string[]): Dive {
  return updateDive(db, diveId, dive => {
    const directSourceIds = [...new Set([...dive.directSourceIds, ...validateSources(db, ids)])];
    return directSourceIds.length === dive.directSourceIds.length ? dive : { ...dive, directSourceIds };
  });
}

function updateDive(db: SqliteDatabase, diveId: string, update: (dive: Dive) => Dive): Dive {
  return db.transaction(() => {
    const row = db.prepare(`${diveRows} AND id = ?`).get(diveId) as DiveRow | undefined;
    const dive = row && decodeDive(row);
    if (!dive) throw new Error('Dive is unavailable');
    const updated = update(dive);
    return updated === dive ? dive : saveDive(db, updated, row.created_at);
  }).immediate();
}
