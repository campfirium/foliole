import { constants } from 'node:fs';
import { open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const activeFileName = '.active-recording.json';
const maxDescriptorBytes = 512;
export const supportLogFilePattern = /^foliole-log-(\d{13})-[a-f0-9-]{36}\.txt$/u;

export interface SupportLogSession {
  fileName: string;
  startedAt: number;
  resumed: boolean;
}

function parseSession(text: string): SupportLogSession | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') return null;
    const { fileName, startedAt, resumed } = value as Partial<SupportLogSession>;
    if (typeof fileName !== 'string' || typeof startedAt !== 'number' || typeof resumed !== 'boolean') return null;
    if (supportLogFilePattern.exec(fileName)?.[1] !== String(startedAt)) return null;
    return { fileName, startedAt, resumed };
  } catch {
    return null;
  }
}

export async function loadSupportLogSession(directory: string): Promise<SupportLogSession | null> {
  const file = await open(path.join(directory, activeFileName), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' || error.code === 'ELOOP') return null;
      throw error;
    });
  if (!file) return null;
  try {
    const size = await file.stat();
    if (!size.isFile() || size.size > maxDescriptorBytes) return null;
    const bytes = Buffer.alloc(size.size);
    const { bytesRead } = await file.read(bytes, 0, size.size, 0);
    return bytesRead === size.size ? parseSession(bytes.toString('utf8')) : null;
  } finally {
    await file.close();
  }
}

export async function saveSupportLogSession(directory: string, session: SupportLogSession) {
  const target = path.join(directory, activeFileName);
  const pending = `${target}.tmp`;
  await rm(pending, { force: true });
  try {
    await writeFile(pending, JSON.stringify(session), { flag: 'wx', mode: 0o600 });
    await rename(pending, target);
  } finally {
    await rm(pending, { force: true });
  }
}

export function removeSupportLogSession(directory: string) {
  return rm(path.join(directory, activeFileName), { force: true });
}
