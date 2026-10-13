// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.ts';

import { hostedProviderRegistrationEvidence } from './ios-hosted-provider-test-evidence.mjs';
import { readIosHostedStateWritebackFacts } from './ios-hosted-state-writeback-facts.mjs';
import { parseStateWritebackSnapshot, readStateWritebackSnapshot,
  verifyStateWritebackAcceptance } from './ios-state-writeback-acceptance-runner.mjs';

const reading = { interval_duration_ms: 60000, interval_growth_factor: 1.5,
  last_handled_at: '2026-07-21T00:01:00.000Z', next_at: '2026-07-21T00:02:00.000Z',
  priority: 2, repetition_count: 3, state: 'active' };
const review = { difficulty: 5.2, due: '2026-07-28T00:01:00.000Z', elapsed_days: 3, lapses: 1,
  last_review_at: '2026-07-21T00:01:00.000Z', reps: 4, scheduled_days: 7, stability: 8.5, state: 2 };
const log = { op_id: 'review-op', grade: 3, scheduler_version: 'fsrs-6', reviewed_at: '2026-07-21T00:01:00.000Z',
  due_before: '2026-07-21T00:01:00.000Z', stability_before: 4.2, difficulty_before: 6.1,
  due_after: '2026-07-28T00:01:00.000Z', stability_after: 8.5, difficulty_after: 5.2 };
const first = { phase: 'applied', status: 'passed' };
const second = { phase: 'reapplied', status: 'passed' };

function snapshot() {
  return parseStateWritebackSnapshot(JSON.stringify([{ active_node_id: 'ios-state-node',
    local_reading_position: 42, local_scroll_top: 42, private_setting_json: '{"enabled":true}',
    reading_json: JSON.stringify(reading), review_json: JSON.stringify(review), review_log_json: JSON.stringify([log]) }]));
}
function observations() {
  return { registration: hostedProviderRegistrationEvidence(), state_writeback: {
    persisted: { reading: { ...reading }, review: { ...review }, review_log: [{ ...log }], phone_private_setting_count: 0 }
  } };
}

it('accepts persisted shared facts and stable phone-private state without any transport counters', () => {
  expect(verifyStateWritebackAcceptance(first, second, snapshot(), snapshot(), observations()))
    .toMatchObject({ first_snapshot: { local_reading_position: 42, local_scroll_top: 42 } });
});

it.each(['reading', 'review', 'review_log', 'private-setting-leak', 'wrong-op', 'duplicate-op'])(
  'rejects incorrect persisted provider evidence: %s', failure => {
    const evidence = observations();
    const facts = evidence.state_writeback.persisted;
    if (failure === 'reading') facts.reading.priority = 9;
    if (failure === 'review') facts.review.stability = 0;
    if (failure === 'review_log') facts.review_log = [];
    if (failure === 'private-setting-leak') facts.phone_private_setting_count = 1;
    if (failure === 'wrong-op') facts.review_log[0].op_id = 'another-op';
    if (failure === 'duplicate-op') facts.review_log.push({ ...log, op_id: 'duplicate' });
    expect(() => verifyStateWritebackAcceptance(first, second, snapshot(), snapshot(), evidence)).toThrow('evidence is incomplete');
  });

it('does not treat legacy push acknowledgements as provider persistence', () => {
  const evidence = observations();
  delete evidence.state_writeback.persisted;
  Object.assign(evidence.state_writeback, { ack_statuses: ['accepted'], push_requests: 1, pack_requests: 3 });
  expect(() => verifyStateWritebackAcceptance(first, second, snapshot(), snapshot(), evidence)).toThrow('evidence is incomplete');
});

it.each(['local_reading_position', 'local_scroll_top', 'private_setting', 'review_log'])(
  'rejects changed permanent state after restart: %s', key => {
    const changed = { ...snapshot(), [key]: key === 'review_log' ? [{ ...log, op_id: 'new-op' }] : null };
    expect(() => verifyStateWritebackAcceptance(first, second, snapshot(), changed, observations())).toThrow('evidence is incomplete');
  });

function insert(db, table, row) {
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
}

it('reads actual SQLite facts and scopes phone-private state to the current host', () => {
  const db = new Database(':memory:');
  initializeDatabaseSchema(db);
  try {
    insert(db, 'nodes', { id: 'ios-state-node', title: 'State', content: '', created_at: 'now', updated_at: 'now' });
    insert(db, 'node_reading', { node_id: 'ios-state-node', ...reading });
    insert(db, 'node_review', { node_id: 'ios-state-node', ...review });
    insert(db, 'review_log', { id: 'log', host_name: 'Phone', node_id: 'ios-state-node', ...log });
    expect(readIosHostedStateWritebackFacts(db)).toEqual(observations().state_writeback.persisted);
    db.exec("CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO companion_meta VALUES ('host_name', 'Phone')");
    insert(db, 'workspace_meta', { key: 'active_node_id', value: 'ios-state-node', updated_at: 'now' });
    for (const [host, position] of [['Other phone', 9], ['Phone', 42]]) {
      insert(db, 'node_reading_host_state', { node_id: 'ios-state-node', host_name: host, reading_position: position, updated_at: 'now' });
      insert(db, 'node_view_state', { node_id: 'ios-state-node', host_name: host, scroll_top: position, source: 'user-scroll', updated_at: 'now' });
      insert(db, 'setting_records', { key: 'handoff_reminder_settings', scope: 'host', platform: 'ios', form_factor: 'phone',
        host_name: host, value_json: JSON.stringify({ enabled: host === 'Phone' }), content_hash: 'hash', updated_at: 'now' });
    }
    const phone = readStateWritebackSnapshot({ containerPath: '/test', databaseRelativePath: 'library.db',
      capture: (_command, args) => JSON.stringify(db.prepare(args[2]).all()) });
    expect(phone).toEqual(snapshot());
    expect(readIosHostedStateWritebackFacts(db).phone_private_setting_count).toBe(2);
    db.exec("DELETE FROM review_log; UPDATE node_reading SET priority = 9 WHERE node_id = 'ios-state-node'");
    expect(readIosHostedStateWritebackFacts(db)).toMatchObject({ reading: { priority: 9 }, review_log: [] });
  } finally { db.close(); }
});
