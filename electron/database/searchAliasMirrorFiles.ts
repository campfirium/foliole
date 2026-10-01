import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveAppPaths } from '../ipc/paths.js';

export function searchAliasFilePath(databasePath: string) {
  return path.join(path.dirname(path.dirname(databasePath)), 'Widgets', 'search-aliases.txt');
}

export function legacySearchAliasFilePath(databasePath: string) {
  return path.join(path.dirname(databasePath), 'search-aliases.txt');
}

export async function migrateLegacySearchAliasFile(databasePath: string) {
  const legacyPath = legacySearchAliasFilePath(databasePath);
  const legacyText = await readOptionalText(legacyPath);
  if (legacyText === null) return;
  const filePath = searchAliasFilePath(databasePath);
  const currentText = await readOptionalText(filePath);
  if (currentText !== null && currentText !== legacyText) {
    throw new Error(`Search aliases exist in both Data and Widgets with different contents: ${legacyPath}; ${filePath}`);
  }
  if (currentText === null) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.copyFile(legacyPath, filePath, constants.COPYFILE_EXCL);
  }
  if (await readOptionalText(legacyPath) !== await readOptionalText(filePath)) {
    throw new Error(`The search aliases file changed during relocation: ${legacyPath}; ${filePath}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  await fs.rename(legacyPath, `${legacyPath}.migrated-${stamp}-${randomUUID().slice(0, 8)}.txt`);
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
