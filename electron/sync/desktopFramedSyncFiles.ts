import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { framedSyncFileKey, type FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';

const writers = new Map<string, Promise<void>>();

function missing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function syncDirectory(directory: string) {
  if (process.platform === 'win32') return;
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function ensureDirectory(directory: string) {
  const first = await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (!first) return;
  let current = directory;
  for (;;) {
    await syncDirectory(current);
    if (current === first) break;
    current = path.dirname(current);
  }
  await syncDirectory(path.dirname(first));
}

async function writeDurably(file: string, bytes: Uint8Array) {
  const directory = path.dirname(file);
  await ensureDirectory(directory);
  const temporary = path.join(directory, `.writing-${randomUUID()}`);
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, file);
    await syncDirectory(directory);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function exclusive<T>(key: string, execute: () => Promise<T>) {
  const previous = writers.get(key) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => pending);
  writers.set(key, tail);
  await previous;
  try { return await execute(); }
  finally {
    release();
    if (writers.get(key) === tail) writers.delete(key);
  }
}

/** The host supplies the selected library's transport root, never a process-wide temp directory. */
export function createDesktopFramedSyncFiles(root: string): FramedSyncFilePort {
  if (!path.isAbsolute(root)) throw new Error('framed_sync_file_root_invalid');
  const resolve = (key: string) => path.join(root, framedSyncFileKey(...key.split('/')));
  return {
    async read(key) {
      try { return new Uint8Array(await fs.readFile(resolve(key))); }
      catch (error) { if (missing(error)) return null; throw error; }
    },
    write(key, bytes) { return writeDurably(resolve(key), bytes); },
    async remove(key) {
      const file = resolve(key);
      try { await fs.rm(file, { recursive: true }); await syncDirectory(path.dirname(file)); }
      catch (error) { if (!missing(error)) throw error; }
    },
    async list(directory) {
      try { return (await fs.readdir(resolve(directory))).filter((name) => !name.startsWith('.')).sort(); }
      catch (error) { if (missing(error)) return []; throw error; }
    },
    exclusive(key, execute) { return exclusive(resolve(key), execute); }
  };
}

export function createDesktopLibrarySyncFiles(databasePath: string) {
  return createDesktopFramedSyncFiles(path.join(path.dirname(databasePath), '..', 'SyncTransport'));
}
