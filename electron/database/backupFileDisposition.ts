import { shell } from 'electron';

export async function moveManagedBackupToTrash(filePath: string) {
  await shell.trashItem(filePath);
}
