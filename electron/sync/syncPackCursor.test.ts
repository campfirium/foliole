import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  assertContiguousSyncPackCursor,
  readSyncPackCursorWithDbPort
} from '../../lib/core/sync/syncPackCursor.js';

it('reads sync pack cursor values from the attached pack manifest', async () => {
  const port = createPort(JSON.stringify({ from_state_seq: 4.8, to_state_seq: 9 }));

  await expect(readSyncPackCursorWithDbPort(port, 'incoming')).resolves.toEqual({
    fromStateSeq: 4,
    toStateSeq: 9
  });
  expect(port.query).toHaveBeenCalledWith(
    "SELECT value FROM incoming.pack_manifest WHERE key = 'manifest_json'"
  );
});

it('checks whether a sync pack cursor can be applied contiguously', () => {
  expect(assertContiguousSyncPackCursor({ fromStateSeq: 4, toStateSeq: 4 }, 4)).toBe(false);
  expect(assertContiguousSyncPackCursor({ fromStateSeq: 4, toStateSeq: 8 }, 4)).toBe(true);
  expect(() => assertContiguousSyncPackCursor({ fromStateSeq: 3, toStateSeq: 8 }, 4))
    .toThrow('sync_pack_cursor_not_contiguous');
});

function createPort(manifestJson: string): DbPort {
  return {
    query: vi.fn(async () => [{ value: manifestJson }]),
    run: vi.fn(),
    transaction: vi.fn()
  } as never;
}
