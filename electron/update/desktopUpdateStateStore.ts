import { promises as fs } from 'node:fs';
import path from 'node:path';

export type DesktopUpdateCheckpoint = 'discovered' | 'downloaded';

export interface DesktopUpdateRecord {
  checkpoint: DesktopUpdateCheckpoint;
  installedVersion: string;
  schemaVersion: 1;
  targetVersion: string;
}

export interface DesktopUpdateStateStore {
  clear: () => Promise<void>;
  read: () => Promise<DesktopUpdateRecord | null>;
  write: (record: DesktopUpdateRecord) => Promise<void>;
}

export function createDesktopUpdateRecord(
  checkpoint: DesktopUpdateCheckpoint,
  installedVersion: string,
  targetVersion: string
): DesktopUpdateRecord {
  return { checkpoint, installedVersion, schemaVersion: 1, targetVersion };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseRecord(value: unknown): DesktopUpdateRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) return null;
  if (record.checkpoint !== 'discovered' && record.checkpoint !== 'downloaded') return null;
  if (!isNonEmptyString(record.installedVersion) || !isNonEmptyString(record.targetVersion)) return null;
  return {
    checkpoint: record.checkpoint,
    installedVersion: record.installedVersion.trim(),
    schemaVersion: 1,
    targetVersion: record.targetVersion.trim()
  };
}

function isMissingFile(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

export function createDesktopUpdateStateStore(filePath: string): DesktopUpdateStateStore {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  let mutationQueue: Promise<void> = Promise.resolve();
  const enqueueMutation = <T>(mutation: () => Promise<T>) => {
    const result = mutationQueue.then(mutation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const clear = () => enqueueMutation(() => fs.rm(filePath, { force: true }));
  return {
    clear,
    async read() {
      await mutationQueue;
      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        if (isMissingFile(error)) return null;
        throw error;
      }
      let record: DesktopUpdateRecord | null = null;
      try {
        record = parseRecord(JSON.parse(content));
      } catch {
        // Invalid JSON is handled like any unsupported record below.
      }
      if (record) return record;
      await clear();
      return null;
    },
    write(record) {
      return enqueueMutation(async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        try {
          await fs.writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
          await fs.rename(temporaryPath, filePath);
        } catch (error) {
          await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
          throw error;
        }
      });
    }
  };
}
