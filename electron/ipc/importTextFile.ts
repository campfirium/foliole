import fs from 'node:fs/promises';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { NativeImportedTextFile } from '../../lib/platform/nativeContract.js';

const IMPORTABLE_TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

function resolveImportKind(filePath: string): NativeImportedTextFile['kind'] {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.txt') {
    return 'text';
  }
  if (IMPORTABLE_TEXT_EXTENSIONS.has(extension)) {
    return 'markdown';
  }
  throw new Error(`unsupported import file extension: ${extension || '(none)'}`);
}

function stripUtf8Bom(content: string) {
  return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

export async function selectImportTextFile(window?: BrowserWindow | null): Promise<NativeImportedTextFile | null> {
  const selection = window
    ? await dialog.showOpenDialog(window, {
        filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }],
        properties: ['openFile']
      })
    : await dialog.showOpenDialog({
        filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }],
        properties: ['openFile']
      });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  const [filePath] = selection.filePaths;
  const content = stripUtf8Bom(await fs.readFile(filePath, 'utf8'));

  return {
    content,
    file_name: path.basename(filePath),
    file_path: filePath,
    kind: resolveImportKind(filePath)
  };
}
