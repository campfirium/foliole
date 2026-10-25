const node = "node_id = 'ios-state-node'";
const jsonFields = fields => fields.split(', ').map(field => `'${field}', ${field}`).join(', ');
const objectQuery = (table, fields) => `SELECT json_object(${jsonFields(fields)}) AS json FROM ${table} WHERE ${node}`;

export const IOS_STATE_WRITEBACK_FACT_QUERIES = {
  reading: objectQuery('node_reading', 'interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state'),
  review: objectQuery('node_review', 'difficulty, due, elapsed_days, lapses, last_review_at, reps, scheduled_days, stability, state'),
  review_log: `SELECT json_group_array(json_object(${jsonFields('op_id, grade, scheduler_version, reviewed_at, kind, voids_op_id')})) AS json
    FROM (SELECT * FROM review_log WHERE ${node} ORDER BY op_id)`
};

/** Reads committed provider facts; no transport acknowledgement is synthesized. */
export function readIosHostedStateWritebackFacts(sqlite) {
  return {
    ...Object.fromEntries(Object.entries(IOS_STATE_WRITEBACK_FACT_QUERIES)
      .map(([key, sql]) => [key, JSON.parse(sqlite.prepare(sql).get()?.json ?? 'null')])),
    phone_private_setting_count: sqlite.prepare(`SELECT count(*) AS count FROM setting_records
      WHERE key = 'handoff_reminder_settings' AND scope = 'host' AND platform = 'ios' AND form_factor = 'phone'`).get().count
  };
}
