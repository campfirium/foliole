import { fork } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hydrateStagedEpubBook, type StagedEpubBook } from './epubBookStaging.js';
import type { RawEpubBook } from './epubImportBook.js';
import type { ImportSourceDescriptor } from './importSourcePipeline.js';

function workerModulePath() {
  // Source-loaded tests use the current compiled worker, never an in-process parser substitute.
  return fileURLToPath(new URL(import.meta.url.endsWith('.ts')
    ? '../../dist/electron/ipc/epubBookProcess.js' : './epubBookProcess.js', import.meta.url));
}

function parseInChildProcess(filePath: string, sourceName: string, root: string) {
  return new Promise<StagedEpubBook>((resolve, reject) => {
    const available = process.availableMemory() || os.freemem();
    const heapMiB = Math.floor(available / 2 / 1024 / 1024);
    if (heapMiB < 64) return reject(new Error('EPUB import failed: insufficient available memory'));
    const child = fork(workerModulePath(), [filePath, sourceName, root], {
      execArgv: [`--max-old-space-size=${heapMiB}`],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    });
    let result: { book?: StagedEpubBook; error?: string } | undefined;
    child.once('message', (message) => { result = message as typeof result; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0 || !result) return reject(new Error('EPUB import failed: parsing process could not complete within available resources'));
      if (result.error) return reject(new Error(result.error));
      if (!result.book) return reject(new Error('EPUB import failed: missing parsed book'));
      resolve(result.book);
    });
  });
}

async function readBook(input: { filePath?: string; bytes?: Uint8Array; sourceName: string }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-epub-'));
  try {
    const filePath = input.filePath ?? path.join(root, 'source.epub');
    if (input.bytes) await writeFile(filePath, input.bytes, { mode: 0o600 });
    const book = hydrateStagedEpubBook(await parseInChildProcess(filePath, input.sourceName, root));
    book.workingDirectory = root;
    book.dispose = () => rm(root, { recursive: true, force: true });
    return book;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export function readRawEpubBook(source: ImportSourceDescriptor): Promise<RawEpubBook> {
  return readBook({ filePath: source.filePath, sourceName: source.sourceName });
}

export function readRawEpubBookBytes(bytes: Uint8Array, sourceName: string): Promise<RawEpubBook> {
  return readBook({ bytes, sourceName });
}
