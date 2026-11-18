import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { NativeSupportLogState } from '../../lib/platform/nativeUtilityContract.js';

const filePattern = /^foliole-log-\d{13}-[a-f0-9-]{36}\.txt$/u;
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const capacityBytes = 64 * 1024 * 1024;
const endMarkerReserve = 256;

type ManagedFile = { filePath: string; bytes: number; updatedAt: number };

async function readManagedFile(directory: string, name: string): Promise<ManagedFile | null> {
  const filePath = path.join(directory, name);
  try {
    const stat = await lstat(filePath);
    return stat.isFile() ? { filePath, bytes: stat.size, updatedAt: stat.mtimeMs } : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function appendExisting(filePath: string, text: string) {
  const file = await open(filePath, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0));
  try {
    await file.writeFile(text, 'utf8');
  } finally {
    await file.close();
  }
}

export class SupportLogFiles {
  private active: { filePath: string; startedAt: number; bytes: number } | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private completedBytes = 0;

  constructor(
    private readonly root: () => string,
    private readonly budget = capacityBytes,
    private readonly now = Date.now
  ) {}

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async prune(reserved = 0) {
    const directory = this.root();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const names = await readdir(directory);
    const files = (await Promise.all(names.filter(name => filePattern.test(name))
      .map(name => readManagedFile(directory, name))))
      .filter((file): file is ManagedFile => file !== null && file.filePath !== this.active?.filePath)
      .sort((left, right) => left.updatedAt - right.updatedAt || left.filePath.localeCompare(right.filePath));
    const cutoff = this.now() - retentionMs;
    let bytes = files.reduce((total, file) => total + file.bytes, 0);
    let firstRetained = 0;
    for (const file of files) {
      if (file.updatedAt >= cutoff && bytes + reserved <= this.budget) break;
      await rm(file.filePath, { force: true });
      bytes -= file.bytes;
      firstRetained++;
    }
    this.completedBytes = bytes;
    return files.length > firstRetained ? files.at(-1)?.filePath : undefined;
  }

  private async readState(): Promise<NativeSupportLogState> {
    if (this.active) return { phase: 'recording', startedAt: this.active.startedAt };
    return { phase: await this.prune() ? 'ready' : 'idle' };
  }

  get recording() {
    return this.active !== null;
  }

  status() {
    return this.enqueue(() => this.readState());
  }

  start(collectContext: () => Promise<string>) {
    return this.enqueue(async (): Promise<NativeSupportLogState> => {
      if (this.active) return this.readState();
      const diagnosticContext = await collectContext();
      const startedAt = this.now();
      const text = JSON.stringify({ event: 'recording.started', at: new Date(startedAt).toISOString(), diagnosticContext }) + '\n';
      const bytes = Buffer.byteLength(text);
      if (bytes + endMarkerReserve > this.budget) throw new Error('Support log context exceeds capacity');
      await this.prune(bytes + endMarkerReserve);
      const filePath = path.join(this.root(), `foliole-log-${startedAt}-${randomUUID()}.txt`);
      await writeFile(filePath, text, { flag: 'wx', mode: 0o600 });
      this.active = { filePath, startedAt, bytes };
      return { phase: 'recording', startedAt };
    });
  }

  private async finish(reason: 'stopped' | 'capacity') {
    const active = this.active;
    if (!active) return;
    const text = JSON.stringify({ event: 'recording.ended', at: new Date(this.now()).toISOString(), reason }) + '\n';
    this.active = null;
    await appendExisting(active.filePath, text);
  }

  stop() {
    return this.enqueue(async () => {
      await this.finish('stopped');
      return this.readState();
    });
  }

  append(format: () => string, startedAt?: number) {
    return this.enqueue(async () => {
      const active = this.active;
      if (!active || (startedAt !== undefined && active.startedAt !== startedAt)) return;
      const text = format() + '\n';
      const bytes = Buffer.byteLength(text);
      const reserved = active.bytes + bytes + endMarkerReserve;
      if (reserved > this.budget) {
        await this.finish('capacity');
        return;
      }
      if (this.completedBytes + reserved > this.budget) await this.prune(reserved);
      try {
        await appendExisting(active.filePath, text);
        active.bytes += bytes;
      } catch (error) {
        this.active = null;
        throw error;
      }
    });
  }

  reveal(showItemInFolder: (filePath: string) => void) {
    return this.enqueue(async (): Promise<NativeSupportLogState> => {
      if (this.active) return this.readState();
      const latest = await this.prune();
      if (!latest) return { phase: 'idle' };
      showItemInFolder(latest);
      return { phase: 'ready' };
    });
  }
}
