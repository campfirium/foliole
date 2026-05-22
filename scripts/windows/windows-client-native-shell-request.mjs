import { rm } from 'node:fs/promises';

export async function removeShellRestartRequest(filePath) {
  await rm(filePath, { force: true });
}
