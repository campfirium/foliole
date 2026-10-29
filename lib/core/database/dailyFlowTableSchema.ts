export const DAILY_FLOW_TABLE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS daily_flow_fact_rows (
    fact_id TEXT NOT NULL REFERENCES daily_flow_sync_facts(id) ON DELETE CASCADE,
    slot TEXT NOT NULL CHECK(slot IN ('rows','removedNodeIds','before','after')),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0), node_id TEXT NOT NULL,
    order_key INTEGER, active INTEGER, cohort TEXT, handled INTEGER, initial_task INTEGER,
    PRIMARY KEY (fact_id, slot, ordinal))`,
  `CREATE TABLE IF NOT EXISTS daily_flow_lists (
    list_id TEXT PRIMARY KEY REFERENCES daily_flow_sync_facts(id) ON DELETE CASCADE,
    row_count INTEGER NOT NULL CHECK(row_count >= 0), complete INTEGER NOT NULL CHECK(complete IN (0,1)))`,
  `CREATE TABLE IF NOT EXISTS daily_flow_projection_facts (
    fact_id TEXT PRIMARY KEY REFERENCES daily_flow_sync_facts(id) ON DELETE CASCADE)`
] as const;
