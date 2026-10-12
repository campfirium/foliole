import { realpathSync } from 'node:fs';
import path from 'node:path';

const active = new Map<string, Promise<void>>();

export function assertAttachmentFileNotLeased(file: string) {
  const key = path.join(realpathSync(path.dirname(file)), path.basename(file));
  if (active.has(key)) throw new Error('attachment_send_busy');
}

/** Senders and file removals share a process-local lease for one canonical path. */
export async function withAttachmentFileLease<T>(file: string, execute: () => Promise<T>): Promise<T> {
  const key = path.join(realpathSync(path.dirname(file)), path.basename(file));
  const previous = active.get(key) ?? Promise.resolve();
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => pending);
  active.set(key, tail);
  await previous;
  try { return await execute(); }
  finally {
    release();
    if (active.get(key) === tail) active.delete(key);
  }
}
