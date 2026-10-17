// @vitest-environment node

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

it('keeps the fixed sync-event projection in the isolated Android test identity', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleAcceptanceSyncEventProjection.java',
    'utf8'
  );
  expect(source).toContain('isAcceptancePackage(context.getPackageName())');
  expect(source).toContain('"com.campfirium.foliole.android.acceptance".equals(packageName)');
  expect(source).toContain('"com.campfirium.foliole.android.s220acceptance".equals(packageName)');
  for (const field of [
    'device_identity_key', 'run_id', 'trigger_reason', 'status', 'result',
    'started_at', 'occurred_at', 'application_id'
  ]) expect(source).toContain(`"${field}"`);
  expect(source).not.toMatch(/endpoint|workgroup_key|SELECT \*/u);
  expect(fs.existsSync(
    'android/app/src/main/java/com/foliole/android/FolioleAcceptanceSyncEventProjection.java'
  )).toBe(false);
});

it('reads absent initial events as an empty list while preserving stored events and rejecting corruption', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleAcceptanceSyncEventProjection.java', 'utf8');
  const expression = source.match(/JSONArray source = new JSONArray\(scalar\(database,([\s\S]+?)\)\);/u)[1];
  const sql = [...expression.matchAll(/"([^"\n]*)"/gu)].map(match => match[1]).join('');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT)');
    const read = () => JSON.parse(Object.values(db.prepare(sql).get() ?? {})[0] ?? '');
    expect(read()).toEqual([]);
    const events = [{ kind: 'run_started', run_id: 'initial-1' }];
    db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_events', JSON.stringify(events));
    expect(read()).toEqual(events);
    db.exec("UPDATE companion_meta SET value = ''");
    expect(read).toThrow();
  } finally { db.close(); }
});
