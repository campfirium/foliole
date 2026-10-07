import { readFileSync } from 'node:fs';

import { sha256 } from '@noble/hashes/sha2.js';
import Database from 'better-sqlite3';

import { availableBlobTables } from '../../lib/core/database/framedSyncAvailableBlobScope.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

export type NativeAvailableScope = 'android' | 'ios';

function nativeStatements(scope: NativeAvailableScope) {
  if (scope === 'ios') {
    const source = readFileSync(new URL('../../ios/App/App/FolioleFramedSyncTransferDatabase.swift', import.meta.url), 'utf8');
    return [...source.matchAll(/"""([\s\S]*?)"""/gu)].map((match) => match[1]!.trim());
  }
  const source = readFileSync(new URL('../../android/app/src/main/java/com/foliole/android/framed/FramedSyncSQLiteSchema.java', import.meta.url), 'utf8');
  return [...source.matchAll(/database\.execSQL\(([\s\S]*?)\);/gu)].map((match) =>
    [...match[1]!.matchAll(/"(?:[^"\\]|\\.)*"/gu)].map((literal) => JSON.parse(literal[0]) as string).join(''));
}

export function nativeAvailableDatabase(scope: NativeAvailableScope) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const schema = scope === 'android' ? 'framed_android' : 'framed_ios';
  const prefix = scope === 'android' ? 'framed_sync_android' : 'framed_sync_ios';
  sqlite.exec(`ATTACH DATABASE ':memory:' AS ${schema}`);
  for (const suffix of ['transfers', 'available_blobs', 'blob_pins']) {
    const name = `${prefix}_${suffix}`;
    const statement = nativeStatements(scope).find((sql) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${name} (`));
    if (!statement) throw new Error(`native_schema_statement_missing:${name}`);
    sqlite.exec(statement.replace(`EXISTS ${name}`, `EXISTS ${schema}.${name}`));
  }
  const tables = availableBlobTables(scope);
  function insert(data: Uint8Array) {
    const hash = sha256(data);
    sqlite.prepare(`INSERT INTO ${tables.available} VALUES (?, ?, ?)`).run(hash, data.length, data);
    return { sha256: hash, byteLength: BigInt(data.length) };
  }
  function pin(descriptor: ReturnType<typeof insert>, seed: number, role: number, required: number) {
    const transfer = new Uint8Array(32).fill(seed);
    sqlite.prepare(`INSERT INTO ${schema}.${prefix}_transfers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(transfer, descriptor.sha256, 0, 1, Number(descriptor.byteLength), 'sender', 'epoch', 'receiver', 'epoch', transfer, 'ready_to_apply');
    sqlite.prepare(`INSERT INTO ${tables.pins} VALUES (?, ?, ?, ?, ?)`)
      .run(transfer, descriptor.sha256, Number(descriptor.byteLength), role, required);
  }
  const rows = (table: string) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  const keys = () => sqlite.prepare(`PRAGMA ${schema}.foreign_key_list(${prefix}_blob_pins)`).all();
  const temporaryTables = () => sqlite.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE name LIKE '%continuous_upgrade'`).all();
  return { sqlite, db: createBetterSqliteDbPort(sqlite), tables, schema, prefix, insert, pin, rows, keys, temporaryTables };
}
