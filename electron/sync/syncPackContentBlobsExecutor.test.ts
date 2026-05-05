import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackContentBlobsWithDbPort } from '../../lib/core/sync/syncPackContentBlobsExecutor.js';

it('applies referenced content blob metadata and returns changed rows', async () => {
  const port = {
    run: vi.fn(async () => ({ changes: 2, lastInsertRowId: null }))
  } as unknown as DbPort;

  await expect(applySyncPackContentBlobsWithDbPort(port, { incomingAlias: 'incoming' })).resolves.toBe(2);
  expect(port.run).toHaveBeenCalledWith(expect.stringContaining('FROM incoming.content_blobs incoming'));
});
