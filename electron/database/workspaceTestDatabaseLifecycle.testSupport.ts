import { appendFileSync } from 'node:fs';

import Database from 'better-sqlite3';
import { vi } from 'vitest';

/** Opt-in evidence for the fixed temporary-database diagnostic action. */
export function observeWorkspaceTestDatabaseLifecycle(testName: string) {
  const output = process.env.FOLIOLE_TEST_DB_LIFECYCLE_LOG;
  if (!output) return () => undefined;
  const observed = new Map<Database.Database, number>();
  function record(event: string, db: Database.Database, stack?: string) {
    if (!observed.has(db)) observed.set(db, observed.size + 1);
    appendFileSync(output!, `${JSON.stringify({ event, testName, pid: process.pid,
      connection: observed.get(db), name: db.name, open: db.open, stack,
      databases: db.open ? db.pragma('database_list') : [] })}\n`);
  }
  const prepare = Database.prototype.prepare;
  const close = Database.prototype.close;
  vi.spyOn(Database.prototype, 'prepare').mockImplementation(function (this: Database.Database, ...args: Parameters<typeof prepare>) {
    if (!observed.has(this)) record('first-use', this, new Error().stack);
    return Reflect.apply(prepare, this, args);
  });
  vi.spyOn(Database.prototype, 'close').mockImplementation(function (this: Database.Database) {
    record('before-close', this);
    const result = Reflect.apply(close, this, []);
    record('after-close', this);
    return result;
  });
  return () => {
    for (const db of observed.keys()) record('before-peer-cleanup', db);
  };
}
