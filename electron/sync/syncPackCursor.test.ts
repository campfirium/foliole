import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  assertContiguousSyncPackCursor,
  readSyncPackCursorWithDbPort
} from '../../lib/core/sync/syncPackCursor.js';

it('reads sync pack cursor values from the attached pack manifest', async () => {
  const port = createPort(JSON.stringify({
    source_epoch: 'source-test', frontier_state_seq: 9, from_state_seq: 4, to_state_seq: 9
  }));

  await expect(readSyncPackCursorWithDbPort(port, 'incoming')).resolves.toEqual({
    sourceEpoch: 'source-test', frontierStateSeq: 9,
    fromStateSeq: 4,
    toStateSeq: 9
  });
  expect(port.query).toHaveBeenCalledWith(
    "SELECT value FROM incoming.pack_manifest WHERE key = 'manifest_json'"
  );
});

it('rejects fractional or unbound pack positions', async () => {
  await expect(readSyncPackCursorWithDbPort(createPort(JSON.stringify({
    source_epoch: 'source-test', frontier_state_seq: 9, from_state_seq: 4.8, to_state_seq: 9
  })))).rejects.toThrow('invalid_sync_pack_manifest');
  await expect(readSyncPackCursorWithDbPort(createPort(JSON.stringify({
    frontier_state_seq: 9, from_state_seq: 4, to_state_seq: 9
  })))).rejects.toThrow('invalid_sync_pack_manifest');
});

it('checks whether a sync pack cursor can be applied contiguously', () => {
  const base = { sourceEpoch: 'source-test', frontierStateSeq: 8 };
  expect(assertContiguousSyncPackCursor({ ...base, fromStateSeq: 4, toStateSeq: 4 }, 4)).toBe(false);
  expect(assertContiguousSyncPackCursor({ ...base, fromStateSeq: 4, toStateSeq: 8 }, 4)).toBe(true);
  expect(() => assertContiguousSyncPackCursor({ ...base, fromStateSeq: 3, toStateSeq: 8 }, 4))
    .toThrow('sync_pack_cursor_not_contiguous');
});

function createPort(manifestJson: string): DbPort {
  return {
    query: vi.fn(async () => [{ value: manifestJson }]),
    run: vi.fn(),
    transaction: vi.fn()
  } as never;
}

it('rejects final dependency descriptors from mixed stable source views', async () => {
  const transfer = { groupId: 'group', peerId: 'peer', sourceViewId: 'view-a', objectType: 'node',
    objectId: 'first', sourceEpoch: 'epoch', fromStateSeq: 0, objectStateSeq: 1,
    frontierStateSeq: 2, expectedRows: 1, expectedDigest: 'a'.repeat(64) };
  const port = createPort(JSON.stringify({ source_epoch: 'epoch', from_state_seq: 0,
    to_state_seq: 2, frontier_state_seq: 2,
    dependency_transfers: [transfer, { ...transfer, objectId: 'second', sourceViewId: 'view-b' }] }));
  await expect(readSyncPackCursorWithDbPort(port)).rejects.toThrow('sync_pack_dependency_source_view_mismatch');
});
