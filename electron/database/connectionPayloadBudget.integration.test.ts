// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { encodeFrameHeader } from '../../lib/core/sync/framedSyncFraming.js';
import { FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { processFrameStream } from '../sync/desktopFramedSyncProcessWire.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { readFramedSyncPayloadBudget } from './framedSyncPayloadBudgetOwner.js';
import { initializeDatabase } from './migrate.js';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-payload-owner-'));
  await initializeDatabase(undefined, { recovery: 'fail', deferSearchIndex: true });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('shares capacity across database ports before SQL reads, cancels on close and starts a fresh owner on reopen', async () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec("CREATE TABLE payload_probe (data BLOB); INSERT INTO payload_probe VALUES (x'00ff01fe')");
  const first = createBetterSqliteDbPort(connection.sqlite);
  const second = createBetterSqliteDbPort(connection.sqlite);
  const budget = readFramedSyncPayloadBudget(first);
  if (!budget) throw new Error('production_payload_budget_missing');
  const occupied = await budget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  let reads = 0;
  async function* source() {
    const [row] = await second.query<{ data: Uint8Array }>('SELECT data FROM payload_probe');
    if (!row) throw new Error('payload_probe_missing');
    reads += 1;
    yield { ciphertext: row.data,
      headerBytes: encodeFrameHeader({ ciphertextBytes: 4, flags: 0, frameType: 1, sequence: 0n }) };
  }
  const iterator = processFrameStream(source(), readFramedSyncPayloadBudget(second))[Symbol.asyncIterator]();
  const waiting = iterator.next();
  const cancelled = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  await setImmediate();
  const beforeClose = reads;
  closeDatabaseConnection();
  await cancelled;
  occupied.release();
  await budget.drained;
  await initializeDatabase(undefined, { recovery: 'fail', deferSearchIndex: true });
  const reopened = openDatabaseConnection();
  const reusable = await reopened.framedSyncPayloadBudget.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
  reusable.release();
  expect(beforeClose).toBe(0);
  expect(reopened.sqlite.prepare('SELECT hex(data) FROM payload_probe').pluck().get()).toBe('00FF01FE');
});
