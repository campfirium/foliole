import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionQueryDefinitions';
import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';

import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

type QueryName = keyof typeof ANDROID_COMPANION_QUERY_DEFINITIONS;
type QueryDefinition = (typeof ANDROID_COMPANION_QUERY_DEFINITIONS)[QueryName];

export function readIosCompanionDatabase<T>(task: (db: DbPort) => Promise<T>) {
  return owner().read(task);
}

export function writeIosCompanionDatabase<T>(task: (db: DbPort) => Promise<T>) {
  return owner().runWriter(task);
}

export function queryIosCompanionDatabase<T extends DbRow>(name: QueryName, params: DbParams = []) {
  const definition = ANDROID_COMPANION_QUERY_DEFINITIONS[name] as QueryDefinition;
  return readIosCompanionDatabase<T[]>((db) => db.query(definition.sql, params).then((rows) => (
    rows.map((row) => normalizeRow(row, 'columns' in definition ? definition.columns : undefined) as T)
  )));
}

export function iosSearchParams(sql: string, query: string, limit: number) {
  const count = (sql.match(/\?/g) ?? []).length;
  return [...Array(Math.max(0, count - 1)).fill(query.toLocaleLowerCase()), limit] as DbParams;
}

function owner() {
  return getIosCompanionDatabaseOwner();
}

function normalizeRow(row: DbRow, columns?: readonly { key: string; source: string; type: string }[]) {
  if (!columns) return row;
  return Object.fromEntries(columns.map((column) => [column.key, normalizeValue(row[column.source], column.type)]));
}

function normalizeValue(value: unknown, type: string) {
  if (type === 'json' && typeof value === 'string') return JSON.parse(value) as unknown;
  if (type === 'long') return Number(value ?? 0);
  if (type === 'double') return value === null || value === undefined ? null : Number(value);
  if (type === 'nullableString') return value === null || value === undefined ? null : String(value);
  return value === null || value === undefined ? '' : String(value);
}
