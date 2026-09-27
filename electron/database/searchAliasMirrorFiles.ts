import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveAppPaths } from '../ipc/paths.js';

export function searchAliasFilePath(databasePath: string) {
  return path.join(path.dirname(databasePath), 'search-aliases.txt');
}

export function searchAliasBaselinePath(databasePath: string) {
  const key = createHash('sha256').update(databasePath).digest('hex').slice(0, 24);
  return path.join(resolveAppPaths().app_config_dir, 'search-aliases', `${key}.json`);
}

export async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(filePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeTextAtomically(filePath: string, text: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, text, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

export async function preserveSearchAliasConflict(filePath: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const conflictPath = `${filePath}.conflict-${timestamp}-${randomUUID().slice(0, 8)}.txt`;
  await fs.copyFile(filePath, conflictPath, constants.COPYFILE_EXCL);
  return conflictPath;
}
