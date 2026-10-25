import path from 'node:path';

import { hostedProviderLifecyclePassed } from './ios-hosted-provider-evidence.mjs';
import { IOS_STATE_WRITEBACK_FACT_QUERIES } from './ios-hosted-state-writeback-facts.mjs';

export function parseStateWritebackSnapshot(output) {
  const [row] = JSON.parse(output || '[]');
  return {
    active_node_id: row?.active_node_id ?? null,
    local_reading_position: Number(row?.local_reading_position ?? -1),
    local_scroll_top: Number(row?.local_scroll_top ?? -1),
    private_setting: JSON.parse(row?.private_setting_json ?? 'null'),
    reading: JSON.parse(row?.reading_json ?? 'null'),
    review: JSON.parse(row?.review_json ?? 'null'),
    review_log: JSON.parse(row?.review_log_json ?? '[]')
  };
}

export function readStateWritebackSnapshot(options) {
  const databasePath = path.join(options.containerPath, options.databaseRelativePath);
  const host = "(SELECT value FROM companion_meta WHERE key = 'host_name')";
  const facts = Object.entries(IOS_STATE_WRITEBACK_FACT_QUERIES)
    .map(([key, sql]) => `(SELECT json FROM (${sql})) AS ${key}_json`).join(',\n');
  const sql = `SELECT ${facts},
    (SELECT value FROM workspace_meta WHERE key = 'active_node_id') AS active_node_id,
    (SELECT reading_position FROM node_reading_host_state WHERE node_id = 'ios-state-node' AND host_name = ${host}) AS local_reading_position,
    (SELECT scroll_top FROM node_view_state WHERE node_id = 'ios-state-node' AND host_name = ${host}) AS local_scroll_top,
    (SELECT value_json FROM setting_records WHERE key = 'handoff_reminder_settings'
      AND scope = 'host' AND platform = 'ios' AND form_factor = 'phone' AND host_name = ${host}
      AND deleted_at IS NULL) AS private_setting_json;`;
  return parseStateWritebackSnapshot(options.capture('sqlite3', ['-json', databasePath, sql]));
}

function matches(actual, expected) {
  return actual && Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function sharedFactsPassed(facts) {
  return matches(facts?.reading, { interval_duration_ms: 60000, interval_growth_factor: 1.5,
    last_handled_at: '2026-07-21T00:01:00.000Z', next_at: '2026-07-21T00:02:00.000Z',
    priority: 2, repetition_count: 3, state: 'active' }) &&
    matches(facts?.review, { difficulty: 5.2, due: '2026-07-28T00:01:00.000Z', elapsed_days: 3,
      lapses: 1, last_review_at: '2026-07-21T00:01:00.000Z', reps: 4, scheduled_days: 7, stability: 8.5, state: 2 }) &&
    facts?.review_log?.length === 1 && typeof facts.review_log[0].op_id === 'string' &&
    facts.review_log[0].op_id.length > 0 && matches(facts.review_log[0], {
      grade: 3, kind: 'review', voids_op_id: null, scheduler_version: 'fsrs-6', reviewed_at: '2026-07-21T00:01:00.000Z',

         });
}

export function verifyStateWritebackAcceptance(first, second, firstSnapshot, secondSnapshot, observations) {
  const state = observations.state_writeback ?? {};
  const persisted = state.persisted;
  const verdicts = {
    bridge: first.phase === 'applied' && first.status === 'passed' && second.phase === 'reapplied' && second.status === 'passed',
    restartStable: JSON.stringify(secondSnapshot) === JSON.stringify(firstSnapshot),
    service: hostedProviderLifecyclePassed(observations) && sharedFactsPassed(persisted) &&
      persisted.phone_private_setting_count === 0 && persisted.review_log[0].op_id === firstSnapshot.review_log?.[0]?.op_id,
    snapshot: sharedFactsPassed(firstSnapshot) && firstSnapshot.active_node_id === 'ios-state-node' &&
      firstSnapshot.local_reading_position === 42 && firstSnapshot.local_scroll_top === 42 &&
      matches(firstSnapshot.private_setting, { enabled: true })
  };
  if (Object.values(verdicts).some(passed => !passed)) {
    throw new Error(`iOS state writeback acceptance evidence is incomplete: ${JSON.stringify({
      first, firstSnapshot, second, secondSnapshot, verdicts
    })}`);
  }
  return { first, first_snapshot: firstSnapshot, observations: state, second, second_snapshot: secondSnapshot };
}
