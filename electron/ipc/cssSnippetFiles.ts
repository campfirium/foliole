import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { NativeCssSnippetDirectory } from '../../lib/platform/nativeCssSnippetCommandMap.js';

const MAX_FILE_BYTES = 16 * 1024;
const MAX_FILES = 128;

async function ensureDirectory(directory: string, create: boolean) {
  if (create) {
    try {
      await mkdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!info) return false;
  if (!info.isDirectory()) throw new Error('CSS snippet location must be a directory.');
  return true;
}

export async function resolveCssSnippetDirectory(libraryHome: string, create = false) {
  const widgets = path.join(libraryHome, 'Widgets');
  const directory = path.join(widgets, 'CSS Snippets');
  const exists = await ensureDirectory(widgets, create) && await ensureDirectory(directory, create);
  return { directory, exists };
}

async function readCssSnippet(directory: string, name: string) {
  const filePath = path.join(directory, name);
  try {
    if (!(await lstat(filePath)).isFile()) return { name, sourceCss: null };
    const file = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      if (!(await file.stat()).isFile()) return { name, sourceCss: null };
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      const sourceCss = bytesRead <= MAX_FILE_BYTES
        ? new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead))
        : null;
      return { name, sourceCss };
    } finally {
      await file.close();
    }
  } catch {
    return { name, sourceCss: null };
  }
}

export async function listCssSnippetFiles(libraryHome: string): Promise<NativeCssSnippetDirectory> {
  const { directory, exists } = await resolveCssSnippetDirectory(libraryHome);
  if (!exists) return { path: directory, files: [] };
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isFile() && /\.css$/i.test(entry.name)).map((entry) => entry.name).sort();
  if (names.length > MAX_FILES) throw new Error('Too many CSS snippet files.');
  const files = await Promise.all(names.map((name) => readCssSnippet(directory, name)));
  return { path: directory, files };
}
