import type BetterSqlite3 from 'better-sqlite3';

import { recordSqliteStatement } from './sqlRecording.js';

type SqliteDatabase = BetterSqlite3.Database;
const caches = new WeakMap<SqliteDatabase, Map<string, BetterSqlite3.Statement>>();
const MAX_CACHED_STATEMENTS = 128;

/** Reuse repeated SQL on one connection instead of deferring thousands of native finalizers. */
export function prepareCachedSqliteStatement(sqlite: SqliteDatabase, sql: string) {
  let cache = caches.get(sqlite);
  if (!cache) {
    cache = new Map();
    caches.set(sqlite, cache);
  }
  const existing = cache.get(sql);
  if (existing) {
    cache.delete(sql);
    cache.set(sql, existing);
    return existing;
  }
  const statement = recordSqliteStatement(sqlite.prepare(sql), sql);
  if (cache.size === MAX_CACHED_STATEMENTS) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(sql, statement);
  return statement;
}
