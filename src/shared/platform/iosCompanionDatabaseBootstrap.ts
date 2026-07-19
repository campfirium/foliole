import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import { COMPANION_SCHEMA_STATEMENTS } from '../../../lib/core/database/companionSchemaStatements';
import {
  COMPANION_DATABASE_NAME,
  COMPANION_DATABASE_VERSION,
  type NativeCompanionBootstrapState
} from '../../../lib/platform/nativeCompanionContract';

const DEVICE_ID_KEY = 'device_id';

export interface IosCompanionDatabaseManager {
  createConnection(
    database: string,
    encrypted: boolean,
    mode: string,
    version: number,
    readonly: boolean
  ): Promise<SQLiteDBConnection>;
  isConnection(database: string, readonly: boolean): Promise<{ result?: boolean }>;
  retrieveConnection(database: string, readonly: boolean): Promise<SQLiteDBConnection>;
}

async function openDatabase(manager: IosCompanionDatabaseManager) {
  const existing = await manager.isConnection(COMPANION_DATABASE_NAME, false);
  const connection = existing.result
    ? await manager.retrieveConnection(COMPANION_DATABASE_NAME, false)
    : await manager.createConnection(
      COMPANION_DATABASE_NAME,
      false,
      'no-encryption',
      COMPANION_DATABASE_VERSION,
      false
    );
  if (!(await connection.isDBOpen()).result) await connection.open();
  return connection;
}

async function loadOrCreateDeviceId(connection: SQLiteDBConnection, proposedId: string, now: string) {
  const result = await connection.query(
    'SELECT value FROM companion_meta WHERE key = ? LIMIT 1',
    [DEVICE_ID_KEY]
  );
  const storedId = result.values?.[0]?.value;
  if (typeof storedId === 'string' && storedId.trim()) return storedId;
  await connection.run(
    'INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)',
    [DEVICE_ID_KEY, proposedId, now]
  );
  return proposedId;
}

function normalizeDatabasePath(value: string) {
  if (!value.startsWith('file:')) return value;
  try {
    return decodeURIComponent(new URL(value).pathname);
  } catch {
    throw new Error('iOS companion database returned an invalid file URL.');
  }
}

export async function initializeIosCompanionDatabase(
  nativeState: NativeCompanionBootstrapState,
  manager: IosCompanionDatabaseManager = new SQLiteConnection(CapacitorSQLite)
): Promise<NativeCompanionBootstrapState> {
  const connection = await openDatabase(manager);
  const schemaSql = `${COMPANION_SCHEMA_STATEMENTS.join(';\n')};\nPRAGMA user_version = ${COMPANION_DATABASE_VERSION}`;
  await connection.execute(schemaSql);
  const deviceId = await loadOrCreateDeviceId(connection, nativeState.device_id, nativeState.booted_at);
  const databaseUrl = (await connection.getUrl()).url;
  if (!databaseUrl) throw new Error('iOS companion database did not return a path.');
  return {
    ...nativeState,
    database_path: normalizeDatabasePath(databaseUrl),
    database_ready: true,
    device_id: deviceId
  };
}
