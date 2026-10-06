// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { closeLibraries, createPeer, edit, startLibraries } from '../../../../../../electron/database/syncEmptyLibraryTestSupport.js';
import { saveNodeReadingStateWithSync } from '../../../../../../lib/core/database/nodeReadingSyncState.js';
import { selectFramedSyncNodeReadingFact } from '../../../../../../lib/core/sync/framedSyncNodeReadingFact.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { installCompanionFramedSyncStaging } from './companionFramedSyncApply.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it.each(['android', 'ios'] as const)('persists every shared reading field through %s framed staging', async (kind) => {
  const source = createPeer('reading-source');
  const receiver = createPeer('reading-receiver');
  edit(source, 'same body');
  edit(receiver, 'same body');
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name,
    reading: { intervalDurationMs: 123456, intervalGrowthFactor: 2.75,
      lastHandledAt: '2026-10-06T00:00:00.000Z', nextAt: '2026-10-09T00:00:00.000Z',
      priority: 3, readingPosition: 0, repetitionCount: 7, state: 'active' },
    updatedAt: '2026-10-06T00:00:00.000Z' });
  const sourcePort = createBetterSqliteDbPort(source.db, { name: 'reading-source' });
  const receiverPort = createBetterSqliteDbPort(receiver.db, { name: 'reading-receiver' });
  const [state] = await sourcePort.query<{ content_hash: string }>(
    "SELECT content_hash FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'topic'");
  const fact = await selectFramedSyncNodeReadingFact(sourcePort, 'topic', `node_reading:${state!.content_hash}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-reading-framed-'));
  const stagingPath = path.join(root, 'staging.db');
  const staging = new Database(stagingPath);
  try {
    const prefix = `framed_sync_${kind}`;
    installCompanionFramedSyncStaging(staging, prefix);
    const transferId = new Uint8Array(32).fill(1);
    const attemptId = new Uint8Array(16).fill(2);
    staging.prepare(`INSERT INTO ${prefix}_transfers VALUES
      (?, ?, 'sender', 'sender-epoch', 'receiver', 'receiver-epoch', ?, 'ready_to_apply')`)
      .run(transferId, new Uint8Array(32).fill(3), attemptId);
    staging.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, '0', 3, ?)`)
      .run(transferId, attemptId, encodeValidatedProtocolMessage('fact', factToWire(fact)));
    const input = { receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
      senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch', stagingKind: kind,
      stagingPath, transferId };
    await applyCompanionFramedSyncTransfer(receiverPort, input);
    await applyCompanionFramedSyncTransfer(receiverPort, input);
    const query = 'SELECT node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state FROM node_reading';
    expect(receiver.db.prepare(query).all()).toEqual(source.db.prepare(query).all());
    expect(receiver.db.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get())
      .toEqual({ count: 1 });
  } finally {
    staging.close();
    fs.rmSync(root, { force: true, recursive: true });
  }
});
