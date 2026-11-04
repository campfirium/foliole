import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ backup: vi.fn(), consume: vi.fn(), register: vi.fn(), inventory: vi.fn(), writer: vi.fn() }));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => ({
  folderBackupSource: f.register, runWriter: f.writer
}) }));
vi.mock('./companion/folderBackup/companionFolderBackupRuntimeRepository', () => ({ getCompanionFolderBackupPort: () => ({ backupDatabase: f.backup }) }));
vi.mock('./companion/folderBackup/companionFolderAttachmentDeletion', () => ({
  captureFolderAttachmentDeletions: vi.fn(async () => null), validateFolderAttachmentDeletions: vi.fn(async () => [])
}));
vi.mock('./companion/folderBackup/consumeCompanionFolderAttachmentWork', () => ({ consumeCompanionFolderAttachmentWork: f.consume }));
vi.mock('./companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { maintainAttachmentFiles: f.inventory } }));

import { backUpCompanionDatabase } from './companion/folderBackup/companionFolderBackup';

beforeEach(() => { vi.clearAllMocks(); f.register.mockResolvedValue('source-owner'); });

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
