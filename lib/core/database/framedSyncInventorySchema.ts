import {
  framedSyncNodeInventorySql,
  framedSyncTombstoneSummarySql,
  framedSyncVersionSummarySql
} from './framedSyncInventoryProjectionSql.js';
import { NODE_CHILD_OWNER_SCHEMA, nodeChildOwnerSql } from './nodeChildStateSql.js';

function triggers(table: string, task: (reference: string) => string) {
  return ['INSERT', 'UPDATE', 'DELETE'].map((action) => {
    const references = action === 'INSERT' ? ['NEW'] : action === 'DELETE' ? ['OLD'] : ['OLD', 'NEW'];
    return `CREATE TRIGGER IF NOT EXISTS trg_framed_inventory_${table}_${action.toLowerCase()}
      AFTER ${action} ON ${table} BEGIN ${references.map(task).join('\n')} END`;
  });
}

const nodeFromVersion = (reference: string) => `(SELECT object_id FROM framed_sync_version_summary
  WHERE version_id = ${reference}.version_id)`;

export const FRAMED_SYNC_INVENTORY_TABLES = [
  ...NODE_CHILD_OWNER_SCHEMA,
  `CREATE TABLE IF NOT EXISTS framed_sync_inventory (
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, content_hash TEXT NOT NULL,
    frontier_json TEXT NOT NULL, relations_json TEXT NOT NULL, reviews_json TEXT NOT NULL,
    states_json TEXT NOT NULL, resources_json TEXT NOT NULL,
    PRIMARY KEY (object_type, object_id)
  )`,
  `CREATE TABLE IF NOT EXISTS framed_sync_version_summary (
    version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, body_hash TEXT,
    resource_hashes_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_framed_sync_version_summary_object
    ON framed_sync_version_summary(object_id, version_id)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_fact_summary (
    kind INTEGER NOT NULL, fact_id TEXT NOT NULL, object_id TEXT NOT NULL,
    PRIMARY KEY (kind, fact_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_framed_sync_fact_summary_object
    ON framed_sync_fact_summary(object_id, kind, fact_id)`,
  `CREATE TABLE IF NOT EXISTS framed_sync_resource_availability (
    hash TEXT PRIMARY KEY, available INTEGER NOT NULL CHECK(available IN (0, 1))
  )`
] as const;

/** Lookups the version triggers run for each written version; without them each one reads a whole table. */
export const FRAMED_SYNC_INVENTORY_LOOKUP_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_framed_sync_fact_summary_parent_version
    ON framed_sync_fact_summary(kind, json_extract(fact_id, '$[0]'), fact_id) WHERE kind = 3`,
  'CREATE INDEX IF NOT EXISTS idx_nodes_current_version_id ON nodes(current_version_id)',
  'CREATE INDEX IF NOT EXISTS idx_node_sync_tombstones_version_id ON node_sync_tombstones(version_id)'
] as const;

function nodeVersionTriggers() {
  return [
    ...triggers('sync_object_state', (ref) =>
    framedSyncNodeInventorySql(`SELECT ${ref}.object_id UNION SELECT ${nodeChildOwnerSql(ref)}`)),
    ...triggers('node_sync_versions', (ref) => `
    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND json_extract(fact_id, '$[0]') = ${ref}.version_id
      AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE version_id = ${ref}.version_id);
    DELETE FROM framed_sync_version_summary WHERE version_id = ${ref}.version_id;
    ${framedSyncVersionSummarySql(`version_id = ${ref}.version_id`)}
    ${framedSyncTombstoneSummarySql(`version_id = ${ref}.version_id`)}
    ${framedSyncNodeInventorySql(`${ref}.object_id`)}`),
    ...triggers('node_sync_tombstones', (ref) => `
    DELETE FROM framed_sync_version_summary WHERE version_id = ${ref}.version_id;
    ${framedSyncVersionSummarySql(`version_id = ${ref}.version_id`)}
    ${framedSyncTombstoneSummarySql(`version_id = ${ref}.version_id`)}
    ${framedSyncNodeInventorySql(`${ref}.node_id`)}`),
    `CREATE TRIGGER IF NOT EXISTS trg_framed_inventory_node_head_body
    AFTER UPDATE OF current_version_id ON nodes
    WHEN NEW.current_version_id IS NOT OLD.current_version_id BEGIN
      UPDATE framed_sync_version_summary SET body_hash = NEW.body_blob_hash
      WHERE version_id = NEW.current_version_id AND body_hash IS NULL
        AND NEW.body_blob_hash IS NOT NULL
        AND EXISTS (SELECT 1 FROM node_sync_versions version
          WHERE version.version_id = NEW.current_version_id AND version.body_text IS NOT NULL);
      ${framedSyncNodeInventorySql('NEW.id')}
    END`
  ];
}

/** Inventory triggers read the full bodies owned by business versions. */
export function createFramedSyncInventoryTriggers() {
  return [
    ...nodeVersionTriggers(),
    ...['node_reading', 'node_open_state'].flatMap(table =>
      triggers(table, ref => framedSyncNodeInventorySql(`${ref}.node_id`))),
    ...triggers('parent_order_sources', ref => framedSyncNodeInventorySql(`${ref}.parent_id`)),
    ...triggers('topic_daily_count_entries', ref => framedSyncNodeInventorySql(`${ref}.node_id`)),
    ...triggers('sync_node_child_owners', ref => framedSyncNodeInventorySql(`${ref}.node_id`)),
    ...childOwnerTriggers(),
    ...triggers('node_text_alternatives', ref => framedSyncNodeInventorySql(`${ref}.node_id`)),
    ...triggers('import_sources', ref => framedSyncNodeInventorySql(`${ref}.latest_node_id`)),
    ...triggers('node_sync_version_parents', (ref) => `
    DELETE FROM framed_sync_fact_summary WHERE kind = 3
      AND fact_id = json_array(${ref}.version_id, ${ref}.parent_version_id, ${ref}.ordinal);
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 3, json_array(parent.version_id, parent.parent_version_id, parent.ordinal), version.object_id
      FROM node_sync_version_parents parent JOIN framed_sync_version_summary version
        ON version.version_id = parent.version_id
      WHERE parent.version_id = ${ref}.version_id AND parent.parent_version_id = ${ref}.parent_version_id
        AND parent.ordinal = ${ref}.ordinal;
    ${framedSyncNodeInventorySql(nodeFromVersion(ref))}`),
    ...triggers('review_log', (ref) => `
    DELETE FROM framed_sync_fact_summary WHERE kind = 4 AND fact_id = ${ref}.op_id;
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 4, op_id, node_id FROM review_log WHERE op_id = ${ref}.op_id;
    ${framedSyncNodeInventorySql(`${ref}.node_id`)}`),
  ];
}

export const FRAMED_SYNC_INVENTORY_TRIGGERS = createFramedSyncInventoryTriggers();

/**
 * The inventory projection reads no column of `nodes`, so these only rewrote unchanged rows and dropped their
 * cached digests on every node write.
 */
const RETIRED_FRAMED_SYNC_INVENTORY_TRIGGERS = ['nodes', 'node_review'].flatMap(table =>
  ['insert', 'update', 'delete'].map(action => `trg_framed_inventory_${table}_${action}`));

export const RETIRED_RESOURCE_AVAILABILITY_TRIGGERS = ['insert', 'update', 'delete']
  .map(action => `trg_framed_inventory_framed_sync_resource_availability_${action}`);

/** Drops every current and retired inventory trigger, so a rebuild never leaves an older definition behind. */
export function dropFramedSyncInventoryTriggers() {
  const current = FRAMED_SYNC_INVENTORY_TRIGGERS.map(sql => {
    const name = /^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)?.[1];
    if (!name) throw new Error('framed_sync_inventory_trigger_name_invalid');
    return name;
  });
  return [...current, ...RETIRED_FRAMED_SYNC_INVENTORY_TRIGGERS, ...RETIRED_RESOURCE_AVAILABILITY_TRIGGERS]
    .map(name => `DROP TRIGGER IF EXISTS ${name}`);
}

export const FRAMED_SYNC_INVENTORY_SCHEMA = [
  ...FRAMED_SYNC_INVENTORY_TABLES, ...FRAMED_SYNC_INVENTORY_LOOKUP_INDEXES, ...FRAMED_SYNC_INVENTORY_TRIGGERS
];

function childOwnerTriggers() {
  const sources = [
    ['node_text_alternative', 'node_text_alternatives', 'alternative_id', 'node_id'],
    ['import_source', 'import_sources', 'source_fingerprint', 'latest_node_id']
  ];
  return sources.flatMap(([type, table, id, owner]) => ['INSERT', 'UPDATE'].map(action =>
    `CREATE TRIGGER IF NOT EXISTS trg_framed_inventory_owner_${table}_${action.toLowerCase()}
     AFTER ${action} ON ${table} BEGIN
       DELETE FROM sync_node_child_owners WHERE object_type = '${type}' AND object_id = NEW.${id}
         AND NEW.${owner} IS NULL;
       INSERT INTO sync_node_child_owners (object_type, object_id, node_id)
         SELECT '${type}', NEW.${id}, NEW.${owner} WHERE NEW.${owner} IS NOT NULL
         ON CONFLICT(object_type, object_id) DO UPDATE SET node_id = excluded.node_id;
     END`));
}
