// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createDesktopFramedSyncSessionNoncePort } from './desktopFramedSyncSessionStaging.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(statement);
});

afterEach(() => sqlite.close());

const state = (sessionSeed: number, nonceSeed = 3) => ({
  contextId: Uint8Array.from({ length: 32 }, () => 2),
  noncePrefix: Uint8Array.from({ length: 4 }, () => nonceSeed),
  sessionId: Uint8Array.from({ length: 16 }, () => sessionSeed),
  startingSequence: 0n as const
});

it('persists a session nonce once and rejects conflicting reuse', async () => {
  const port = createDesktopFramedSyncSessionNoncePort(createBetterSqliteDbPort(sqlite));

  expect(await port.persistBeforeEncryption(state(1))).toBe('created');
  expect(await port.persistBeforeEncryption(state(1))).toBe('identical');
  await expect(port.persistBeforeEncryption(state(1, 9)))
    .rejects.toThrow('framed_sync_session_send_state_conflict');

  await port.abandon(state(1).sessionId);
  expect(sqlite.prepare(`SELECT state FROM framed_sync_session_send_states
    WHERE session_id = ?`).get(Buffer.from(state(1).sessionId))).toEqual({ state: 'abandoned' });
});

it('keeps a reconnect session independent from the abandoned session', async () => {
  const port = createDesktopFramedSyncSessionNoncePort(createBetterSqliteDbPort(sqlite));

  await port.persistBeforeEncryption(state(1));
  await port.abandon(state(1).sessionId);
  expect(await port.persistBeforeEncryption(state(2))).toBe('created');

  expect(sqlite.prepare('SELECT session_id, state FROM framed_sync_session_send_states ORDER BY rowid')
    .all()).toEqual([
      { session_id: Buffer.from(state(1).sessionId), state: 'abandoned' },
      { session_id: Buffer.from(state(2).sessionId), state: 'prepared' }
    ]);
});
