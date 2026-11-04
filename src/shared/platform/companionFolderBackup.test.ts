import { expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  state: { configured: true, directoryLabel: 'Backup', databaseSavedAt: 'saved', phase: 'working', errorMessage: null },
  native: { backupDatabase: vi.fn(), copyAttachment: vi.fn(), finishAttachments: vi.fn(), prepareAttachmentDirectory: vi.fn() },
  inventory: vi.fn()
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ folderBackupSource: async () => 'epoch' })
}));
vi.mock('./companionFolderBackupRuntimeRepository', () => ({ getCompanionFolderBackupPort: () => f.native }));
vi.mock('./companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { maintainAttachmentFiles: f.inventory } }));
import { backUpCompanionDatabase } from './companionFolderBackup';

it('keeps a committed database success when an actual attachment copy fails and reports pending files separately', async () => {
  f.native.backupDatabase.mockImplementation(async input => ({ requestId: input.requestId, cancelled: false,
    databaseCommitted: true, sourcePages: 8403, changedPages: 3, state: f.state }));
  f.inventory.mockResolvedValue({ files: [{ storageKey: `${'a'.repeat(64)}.png`, sizeBytes: 3 }] });
  f.native.copyAttachment.mockRejectedValue(new Error('Not enough space.'));
  f.native.finishAttachments.mockImplementation(async input => ({ ...f.state, phase: 'pending', attachmentFilesPending: input.pending, errorMessage: input.errorMessage }));
  const result = await backUpCompanionDatabase();
  expect(result.databaseCommitted).toBe(true);
  expect(result.changedPages).toBe(3);
  expect(result.state).toMatchObject({ databaseSavedAt: 'saved', phase: 'pending', attachmentFilesPending: 1, errorMessage: 'Not enough space.' });
});
it('does not copy attachments when directory selection was cancelled', async () => {
  f.native.copyAttachment.mockClear();
  f.native.backupDatabase.mockImplementation(async input => ({ requestId: input.requestId, cancelled: true, databaseCommitted: false, state: f.state }));
  await backUpCompanionDatabase(true);
  expect(f.native.copyAttachment).not.toHaveBeenCalled();
});
