// @vitest-environment node

import { expect, it, vi } from 'vitest';

const trashItem = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('electron', () => ({ shell: { trashItem } }));

import { moveManagedBackupToTrash } from './backupFileDisposition.js';

it('moves a managed backup through the operating system trash API', async () => {
  await moveManagedBackupToTrash('/Backups/older.db.gz');

  expect(trashItem).toHaveBeenCalledWith('/Backups/older.db.gz');
});
