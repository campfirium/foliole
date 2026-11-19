import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { NativeSupportLogState } from '../../lib/platform/nativeUtilityContract.js';

import { loadSupportLogSession, removeSupportLogSession, saveSupportLogSession, supportLogFilePattern } from './supportLogSession.js';

const durationMs = 5 * 60 * 1000;
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const capacityBytes = 64 * 1024 * 1024;
const endMarkerReserve = 256;

type ManagedFile = { filePath: string; bytes: number; updatedAt: number };
type FinishReason = 'stopped' | 'capacity' | 'expired' | 'restart-limit';

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
  private initialized = false;
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly root: () => string,
    private readonly budget = capacityBytes,
    private readonly now = Date.now
  ) {}

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      if (!this.initialized) {
        this.initialized = true;
        await this.restore();
      }
      if (this.active && this.active.startedAt + durationMs <= this.now()) await this.finish('expired');
      return run();
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async prune(reserved = 0) {
    const directory = this.root();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const names = await readdir(directory);
    const files = (await Promise.all(names.filter(name => supportLogFilePattern.test(name))
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

  private scheduleDeadline(startedAt: number) {
    this.deadlineTimer = setTimeout(() => {
      void this.enqueue(async () => {
        if (this.active?.startedAt === startedAt) this.scheduleDeadline(startedAt);
      }).catch(() => undefined);
    }, Math.max(0, startedAt + durationMs - this.now()));
    this.deadlineTimer.unref?.();
  }

  private async restore() {
    const directory = this.root();
    const session = await loadSupportLogSession(directory);
    if (!session) return;
    const file = await readManagedFile(directory, session.fileName);
    if (!file || session.startedAt > this.now() || file.bytes + endMarkerReserve > this.budget) {
      await removeSupportLogSession(directory);
      return;
    }
    this.active = { filePath: file.filePath, bytes: file.bytes, startedAt: session.startedAt };
    if (session.startedAt + durationMs <= this.now()) return this.finish('expired');
    if (session.resumed) return this.finish('restart-limit');

    const text = JSON.stringify({ event: 'recording.resumed', at: new Date(this.now()).toISOString() }) + '\n';
    const bytes = Buffer.byteLength(text);
    const reserved = file.bytes + bytes + endMarkerReserve;
    if (reserved > this.budget) return this.finish('capacity');
    try {
      await this.prune(reserved);
      await saveSupportLogSession(directory, { ...session, resumed: true });
      await appendExisting(file.filePath, text);
      this.active.bytes += bytes;
      this.scheduleDeadline(session.startedAt);
    } catch (error) {
      this.active = null;
      throw error;
    }
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
      const startedAt = this.now();
      const diagnosticContext = await collectContext();
      const text = JSON.stringify({ event: 'recording.started', at: new Date(startedAt).toISOString(), diagnosticContext }) + '\n';
      const bytes = Buffer.byteLength(text);
      if (bytes + endMarkerReserve > this.budget) throw new Error('Support log context exceeds capacity');
      await this.prune(bytes + endMarkerReserve);
      const fileName = `foliole-log-${startedAt}-${randomUUID()}.txt`;
      const filePath = path.join(this.root(), fileName);
      await writeFile(filePath, text, { flag: 'wx', mode: 0o600 });
      try {
        await saveSupportLogSession(this.root(), { fileName, startedAt, resumed: false });
      } catch (error) {
        await rm(filePath, { force: true }).catch(() => undefined);
        throw error;
      }
      this.active = { filePath, startedAt, bytes };
      this.scheduleDeadline(startedAt);
      return { phase: 'recording', startedAt };
    });
  }

  private async finish(reason: FinishReason) {
    const active = this.active;
    if (!active) return;
    const text = JSON.stringify({ event: 'recording.ended', at: new Date(this.now()).toISOString(), reason }) + '\n';
    this.active = null;
    clearTimeout(this.deadlineTimer);
    await removeSupportLogSession(this.root());
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
        clearTimeout(this.deadlineTimer);
        await removeSupportLogSession(this.root()).catch(() => undefined);
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
