import { expect, it, vi } from 'vitest';

import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';

import { copyCompanionFolderAttachments } from './copyCompanionFolderAttachments';

const key = (value: string) => `${value.repeat(64)}.png`;
function fixture() {
  const port = { prepareAttachmentDirectory: vi.fn(async () => undefined), copyAttachment: vi.fn(async () => ({ copied: true })),
    finishAttachments: vi.fn(async input => input) };
  return { port, run: (keys: string[]) => copyCompanionFolderAttachments(port as unknown as CompanionFolderBackupPort,
    { requestId: 'saved-database', sourceEpoch: 'owner' }, async () => ({ files: keys.map(storageKey => ({ storageKey, sizeBytes: 2 })) })) };
}
it('copies all actual files without restricting them to database references and retries only unfinished files', async () => {
  const f = fixture();
  f.port.copyAttachment.mockImplementation(async ({ storageKey }) => {
    if (storageKey === key('b')) throw new Error('Source file disappeared.');
    return { copied: true };
  });
  await f.run([key('a'), key('b'), key('c')]);
  expect(f.port.copyAttachment).toHaveBeenCalledTimes(3);
  expect(f.port.finishAttachments).toHaveBeenLastCalledWith({ requestId: 'saved-database', copied: 2, pending: 1, errorMessage: 'Source file disappeared.' });
  f.port.copyAttachment.mockImplementation(async ({ storageKey }) => ({ copied: storageKey === key('b') }));
  await f.run([key('a'), key('b'), key('c')]);
  expect(f.port.finishAttachments).toHaveBeenLastCalledWith({ requestId: 'saved-database', copied: 1, pending: 0, errorMessage: null });
});
it('keeps unknown inventory separate from an empty directory and still ends the attachment stage', async () => {
  const f = fixture();
  await copyCompanionFolderAttachments(f.port as unknown as CompanionFolderBackupPort,
    { requestId: 'saved-database', sourceEpoch: 'owner' }, async () => { throw new Error('Permission revoked.'); });
  expect(f.port.finishAttachments).toHaveBeenLastCalledWith({ requestId: 'saved-database', copied: 0, pending: null, errorMessage: 'Permission revoked.' });
  await f.run([]);
  expect(f.port.finishAttachments).toHaveBeenLastCalledWith({ requestId: 'saved-database', copied: 0, pending: 0, errorMessage: null });
});
