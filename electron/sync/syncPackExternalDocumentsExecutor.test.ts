import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackExternalDocumentsWithDbPort } from '../../lib/core/sync/syncPackExternalDocumentsExecutor.js';

it('applies external documents from the attached pack', async () => {
  const port = {
    run: vi.fn(async () => ({ changes: 3, lastInsertRowId: null }))
  } as unknown as DbPort;

  await expect(applySyncPackExternalDocumentsWithDbPort(port, { incomingAlias: 'incoming' })).resolves.toBe(3);
  expect(port.run).toHaveBeenCalledWith(expect.stringContaining('FROM incoming.external_documents'));
});
