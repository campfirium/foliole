import { expect, it, vi } from 'vitest';

import { applyCompanionAttachmentManifest } from './companionBatchDataPlane.js';
import type { DbPort } from './dbPort.js';

it('validates staged files against retained metadata without persisting possession state', async () => {
  const port = fakePort();
  port.query = vi.fn(async () => [{ id: 'c'.repeat(64), mime_type: 'image/png', size_bytes: 12 }]) as DbPort['query'];
  await expect(applyCompanionAttachmentManifest(port, {
    entries: [{ attachmentId: 'c'.repeat(64), contentHash: 'c'.repeat(64), mimeType: 'image/png',
      sizeBytes: 12, storageKey: `${'c'.repeat(64)}.png` }],
    failedIds: [], now: '2026-08-06T00:00:00.000Z'
  })).resolves.toEqual({ failedIds: [], syncedIds: ['c'.repeat(64)] });
  expect(port.run).not.toHaveBeenCalled();
});

function fakePort(): DbPort {
  const port = {
    query: vi.fn(async () => []),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null }))
  } as unknown as DbPort;
  port.transaction = vi.fn(async <T>(task: (tx: DbPort) => Promise<T>): Promise<T> => task(port)) as unknown as DbPort['transaction'];
  return port;
}
