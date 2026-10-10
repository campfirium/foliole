// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { retireFramedSyncCompletedPublication } from '../../lib/core/sync/framedSyncCompletedPublication.js';

import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { sendDesktopFramedSyncRoundBatch } from './desktopFramedSyncRoundBatch.js';
import { verifiedReceiverFixture } from './desktopFramedSyncVerifiedReceiver.testSupport.js';

const cases = [true, false].flatMap(verified => ['selection', 'first-frame'].map(phase => ({ verified, phase })));

it.each(cases)('handles retirement at $phase with verified receipt=$verified', async ({ verified, phase }) => {
  const body = 'Complete body before replay retirement';
  const a = await verifiedReceiverFixture(body);
  let interleaved = false;
  const interleave = async () => {
    interleaved = true;
    await retireAttempt(a, verified);
  };
  const db: DbPort = {
    run: (sql, params) => a.sender.db.run(sql, params),
    transaction: execute => a.sender.db.transaction(execute),
    async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
      const rows = await a.sender.db.query<T>(sql, params);
      if (phase === 'selection' && !interleaved && sql.includes("state = 'replayable' ORDER BY rowid LIMIT 1")) {
        expect(rows).toHaveLength(1);
        await interleave();
      }
      return rows;
    }
  };
  const staging = { ...a.staging,
    async *streamReplayableFrames(...args: Parameters<typeof a.staging.streamReplayableFrames>) {
      for await (const frame of a.staging.streamReplayableFrames(...args)) {
        if (phase === 'first-frame' && !interleaved) await interleave();
        yield frame;
      }
    }
  };
  try {
    const result = sendDesktopFramedSyncRoundBatch({ db,
      groupSecret: Buffer.from(a.groupKey).toString('base64url'),
      peerOrigin: 'http://127.0.0.1:1', staging }, [a.publication]);
    if (verified) {
      await expect(result).resolves.toEqual([{ state: 'committed' }]);
      expect(a.receiver.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe(body);
      a.reopen();
      expect(a.receiver.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe(body);
    } else await expect(result).rejects.toThrow(phase === 'selection'
      ? 'outbound_attempt_not_replayable' : 'outbound_frame_sequence_gap');
    expect(interleaved).toBe(true);
  } finally { a.close(); }
});

async function retireAttempt(a: Awaited<ReturnType<typeof verifiedReceiverFixture>>, verified: boolean) {
  if (!verified) return a.staging.abandonOutboundAttempt(a.publication.transferId, a.attempt.attemptId);
  await receiveDesktopFramedSyncTransfer({ context: a.context, db: a.receiver.db,
    groupKey: a.groupKey, staging: a.receiver.staging, stream: await a.stream() });
  const receipt = await a.receiver.staging.loadReceipt(a.publication.transferId);
  if (!receipt) throw new Error('test_verified_receipt_missing');
  await a.staging.commitOutboundReceipt(receipt);
  await a.staging.releaseOutboundHolds(a.publication.transferId);
  await retireFramedSyncCompletedPublication(a.sender.db, a.publication.transferId);
}
