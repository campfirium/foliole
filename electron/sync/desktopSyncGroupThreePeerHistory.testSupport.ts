import type Database from 'better-sqlite3';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';

export function seedThreePeerVersions(driver: DatabaseDriver, count: number) {
  driver.execute(`INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
    VALUES ('node-1', 'topic', 'Node 1', ?, ?, 'now', 'now')`, [`body-${count}`, `v${count}`]);
  for (let i = 1; i <= count; i += 1) {
    const id = `v${String(i).padStart(2, '0')}`;
    const parent = i === 1 ? null : `v${String(i - 1).padStart(2, '0')}`;
    driver.execute(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
      host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node-1', ?, 'A', 'now', ?, ?, '{"id":"node-1","content":null}')`,
    [id, parent, `hash-${id}`, `body-${i}`]);
    if (parent) driver.execute('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)', [id, parent]);
  }
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', 'node-1', 1, ?, 'A', 'now', 0)`, [`hash-v${count}`]);
}

export function appendThreePeerVersion24(driver: DatabaseDriver) {
  driver.execute(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
    host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('v24', 'node-1', 'v23', 'A', 'now', 'hash-v24', 'body-24',
      '{"id":"node-1","content":null}')`);
  driver.execute("INSERT INTO node_sync_version_parents VALUES ('v24', 'v23', 0)");
  driver.execute("UPDATE nodes SET current_version_id = 'v24', content = 'body-24' WHERE id = 'node-1'");
  driver.execute("UPDATE sync_object_state SET state_seq = 2, content_hash = 'hash-v24' WHERE object_id = 'node-1'");
  driver.execute('UPDATE sync_state_sequence SET high_water = 2 WHERE singleton_id = 1');
}

export function addThreePeerReview(driver: DatabaseDriver, index: number, seq: number) {
  const time = `2026-09-30T00:0${index}:00Z`;
  driver.execute(`INSERT INTO review_log
    (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
      due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after)
    VALUES (?, ?, 'A', 'node-1', 3, 'ts-fsrs@4', ?, 'before', 1, 2, 'after', 3, 4)`,
  [`log-${index}`, `op-${index}`, time]);
  driver.execute(`INSERT INTO node_review
    (node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses)
    VALUES ('node-1', 'after', ?, 2, 3, 4, 1, 1, ?, 0)
    ON CONFLICT(node_id) DO UPDATE SET last_review_at=excluded.last_review_at, reps=excluded.reps`, [time, index]);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node_review', 'node-1', ?, ?, 'A', ?, 0)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq=excluded.state_seq,
      content_hash=excluded.content_hash, updated_at=excluded.updated_at`, [seq, `review-${index}`, time]);
  driver.execute('UPDATE sync_state_sequence SET high_water=? WHERE singleton_id=1', [seq]);
}

export function readThreePeerIncomingFacts(target: Database.Database, dependencyPage: boolean) {
  const versionIds = target.prepare('SELECT version_id FROM inc.node_sync_versions').pluck().all() as string[];
  const reviewOpIds = target.prepare('SELECT op_id FROM inc.review_log').pluck().all() as string[];
  if (dependencyPage) {
    const rows = target.prepare('SELECT row_json FROM inc.sync_pack_dependency_page_rows').pluck().all() as string[];
    for (const serialized of rows) {
      const row = JSON.parse(serialized);
      if (row.table === 'review_log') reviewOpIds.push(JSON.parse(row.json).op_id);
      if (row.table === 'node_sync_versions') versionIds.push(JSON.parse(row.json).version_id);
    }
  }
  return { versionIds, reviewOpIds };
}
