import fs from 'node:fs';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording.js';

let configured = false;

export function configureDesktopSqlRecording() {
  if (configured) return;
  configured = true;
  if (!process.env.FOLIOLE_SQL_RECORDING_MS) return;
  try {
    const directory = path.resolve(process.env.FOLIOLE_SQL_RECORDING_DIR ?? '.tmp/artifacts/sql-recording');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `${Date.now()}-${process.pid}.json`);
    fs.writeFileSync(file, '{}', { flag: 'wx', mode: 0o600 });
    sqlRecording.onStopped = report => fs.writeFileSync(file, JSON.stringify(report, null, 2));
    sqlRecording.start({ durationMs: Number(process.env.FOLIOLE_SQL_RECORDING_MS), label: 'desktop-session' });
    // Available only after explicit opt-in, in the main-process inspector console.
    Object.assign(globalThis, { __folioleSqlRecording: sqlRecording });
  } catch (error) {
    console.error('SQL recording could not start:', error instanceof Error ? error.message : String(error));
  }
}

export function recordSqliteStatement(statement: BetterSqlite3.Statement, sql: string): BetterSqlite3.Statement {
  configureDesktopSqlRecording();
  let wrapped: BetterSqlite3.Statement;
  wrapped = new Proxy(statement, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const execute = () => Reflect.apply(value, target, args) as unknown;
        const result = property === 'all' || property === 'get' || property === 'run'
          ? sqlRecording.measure(sql, property, 'desktop', execute) : execute();
        return result === target ? wrapped : result;
      };
    }
  });
  return wrapped;
}
