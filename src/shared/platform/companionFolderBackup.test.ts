import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ backup: vi.fn(), consume: vi.fn(), validate: vi.fn(), register: vi.fn(), inventory: vi.fn(), cancel: vi.fn(async () => undefined), writer: vi.fn() }));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => {
  const owner = { folderBackupSource: f.register, runWriter: f.writer };
  return { getIosCompanionDatabaseOwner: () => owner };
});
vi.mock('./companion/folderBackup/companionFolderBackupRuntimeRepository', () => ({ getCompanionFolderBackupPort: () => ({ backupDatabase: f.backup, cancelDatabase: f.cancel }) }));
vi.mock('./companion/folderBackup/companionFolderAttachmentDeletion', () => ({
  captureFolderAttachmentDeletions: vi.fn(async () => null), validateFolderAttachmentDeletions: f.validate
}));
vi.mock('./companion/folderBackup/consumeCompanionFolderAttachmentWork', () => ({ consumeCompanionFolderAttachmentWork: f.consume }));
vi.mock('./companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { maintainAttachmentFiles: f.inventory } }));

import { backUpCompanionDatabase } from './companion/folderBackup/companionFolderBackup';

beforeEach(() => { vi.clearAllMocks(); f.register.mockResolvedValue('source-owner'); f.validate.mockResolvedValue([]); });

it('consumes persistent work only after the actual database operation has committed, preserving its result', async () => {
  let committed = false;
  f.backup.mockImplementation(async input => {
    committed = true;
    return { requestId: input.requestId, cancelled: false, databaseCommitted: true, changedPages: 3,
      state: { directoryId: 'current-directory', databaseSavedAt: 'committed database' } };
  });
  f.consume.mockImplementation(async (_port, _source, input) => {
    expect(committed).toBe(true);
    expect(input).toMatchObject({ sourceEpoch: 'source-owner', profile: 'current-directory' });
    return { databaseSavedAt: 'committed database', attachmentFilesPending: 1, errorMessage: 'copy failed' };
  });
  expect(await backUpCompanionDatabase()).toMatchObject({ databaseCommitted: true, changedPages: 3,
    state: { databaseSavedAt: 'committed database', attachmentFilesPending: 1, errorMessage: 'copy failed' } });
  expect(f.inventory).not.toHaveBeenCalled();
});

it.each(['cancelled', 'failed'])('does not touch attachment work after a %s database operation', async mode => {
  f.backup.mockImplementation(async input => ({ requestId: input.requestId, cancelled: mode === 'cancelled', databaseCommitted: false }));
  await backUpCompanionDatabase(); expect(f.consume).not.toHaveBeenCalled();
});

it('releases the native request when the database owner closes after its database was saved', async () => {
  f.backup.mockImplementation(async input => ({ requestId: input.requestId, cancelled: false, databaseCommitted: true,
    state: { directoryId: 'current-directory' } }));
  f.validate.mockRejectedValueOnce(new Error('owner closed'));
  await expect(backUpCompanionDatabase()).rejects.toThrow('owner closed');
  expect(f.cancel).toHaveBeenCalledWith({ requestId: f.backup.mock.calls[0]![0].requestId });
  expect(f.consume).not.toHaveBeenCalled();
});
