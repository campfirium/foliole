import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveAppPaths } from '../ipc/paths.js';

export function searchAliasFilePath(databasePath: string) {
  return path.join(path.dirname(path.dirname(databasePath)), 'Widgets', 'search-synonyms.txt');
}

export function legacySearchAliasFilePath(databasePath: string) {
  return path.join(path.dirname(databasePath), 'search-aliases.txt');
}

function legacyWidgetSearchAliasFilePath(databasePath: string) {
  return path.join(path.dirname(searchAliasFilePath(databasePath)), 'search-aliases.txt');
}

export async function migrateLegacySearchAliasFile(databasePath: string) {
  const filePath = searchAliasFilePath(databasePath);
  const legacyPaths = [legacyWidgetSearchAliasFilePath(databasePath), legacySearchAliasFilePath(databasePath)];
  const legacyFiles = (await Promise.all(legacyPaths.map(async (file) => ({
    file, text: await readOptionalText(file)
  })))).filter((entry): entry is { file: string; text: string } => entry.text !== null);
  if (legacyFiles.length === 0) return;
  const currentText = await readOptionalText(filePath);
  const expectedText = currentText ?? legacyFiles[0]!.text;
  if (legacyFiles.some((entry) => entry.text !== expectedText)) {
    throw new Error(`Search synonym files have different contents: ${[filePath, ...legacyPaths].join('; ')}`);
  }
  if (currentText === null) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.copyFile(legacyFiles[0]!.file, filePath, constants.COPYFILE_EXCL);
  }
  for (const legacy of legacyFiles) {
    if (await readOptionalText(legacy.file) !== await readOptionalText(filePath)) {
      throw new Error(`The search synonym file changed during relocation: ${legacy.file}; ${filePath}`);
    }
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
    await fs.rename(legacy.file, `${legacy.file}.migrated-${stamp}-${randomUUID().slice(0, 8)}.txt`);
  }
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
