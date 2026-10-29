export const DAILY_FLOW_LOCAL_APPLICATION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS daily_flow_local_operation_rows (
    day_key TEXT NOT NULL, node_id TEXT NOT NULL, before_json TEXT,
    PRIMARY KEY(day_key, node_id))`,
  `CREATE TABLE IF NOT EXISTS daily_flow_local_operation_state (
    day_key TEXT PRIMARY KEY, base_json TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS daily_flow_action_time ON daily_flow_sync_facts(occurred_at, id)'
] as const;
