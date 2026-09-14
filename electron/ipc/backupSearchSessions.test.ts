// @vitest-environment node

import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  backups: [{ filePath: '/managed/backup.db', updatedAt: '2026-09-10T00:00:00.000Z' }],
  clients: [] as Array<{
    input: unknown;
    nextCalls: number;
    pending: Array<{ reject: (error: Error) => void; resolve: (value: unknown) => void }>;
    terminateCalls: number;
    terminateGate: Promise<void>;
  }>,
  userDataPath: '/tmp/foliole-backup-search-session-tests'
}));

vi.mock('electron', () => ({ app: { getPath: () => mocks.userDataPath } }));
vi.mock('../database/backupRestore.js', () => ({
  listApplicationDatabaseBackups: vi.fn(async () => mocks.backups)
}));
vi.mock('./backupSearchWorkerClient.js', () => ({
  BackupSearchWorkerClient: class {
    readonly input: unknown;
    nextCalls = 0;
    pending: Array<{ reject: (error: Error) => void; resolve: (value: unknown) => void }> = [];
    terminateCalls = 0;
    terminateGate: Promise<void> = Promise.resolve();
    constructor(input: unknown) { this.input = input; mocks.clients.push(this); }
    next() {
      this.nextCalls += 1;
      return new Promise((resolve, reject) => this.pending.push({ reject, resolve }));
    }
    async terminate() {
      this.terminateCalls += 1;
      this.pending.splice(0).forEach(({ reject }) => reject(new DOMException('cancelled', 'AbortError')));
      await this.terminateGate;
    }
  }
}));

import {
  cancelBackupSearchSession,
  cleanupOrphanedBackupSearchSessions,
  disposeBackupSearchSessions,
  nextBackupSearchSession,
  startBackupSearchSession
} from './backupSearchSessions.js';

class FakeOwner extends EventEmitter {
  destroyed = false;
  constructor(readonly id: number) { super(); }
  isDestroyed() { return this.destroyed; }
}

let tempRoot = '';

beforeEach(async () => {
  mocks.clients = [];
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-search-sessions-'));
  mocks.userDataPath = tempRoot;
});

afterEach(async () => {
  await disposeBackupSearchSessions();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function owner(id: number) {
  return new FakeOwner(id) as unknown as import('electron').WebContents;
}

it('returns an opaque id before the first result and uses only the managed catalog paths', async () => {
  const renderer = owner(1);
  const started = await startBackupSearchSession(' needle ', renderer);
  const worker = mocks.clients[0];

  expect(started.session_id).toMatch(/^[0-9a-f-]{36}$/u);
  expect(worker?.nextCalls).toBe(0);
  expect(worker?.input).toMatchObject({ backups: mocks.backups, query: 'needle' });
  expect(JSON.stringify(worker?.input)).not.toContain('renderer-path');
});

it('serializes next calls and rejects expired or foreign sessions', async () => {
  const renderer = owner(2);
  const foreign = owner(3);
  const { session_id: sessionId } = await startBackupSearchSession('needle', renderer);
  const worker = mocks.clients[0];
  const first = nextBackupSearchSession(sessionId, renderer);
  const second = nextBackupSearchSession(sessionId, renderer);
  await vi.waitFor(() => expect(worker?.nextCalls).toBe(1));
  worker?.pending.shift()?.resolve({ skipped_backup_count: 0, status: 'complete' });
  await first;
  await Promise.resolve();
  expect(worker?.nextCalls).toBe(2);
  worker?.pending.shift()?.resolve({ skipped_backup_count: 0, status: 'complete' });
  await second;

  expect(() => nextBackupSearchSession(sessionId, foreign)).toThrow('expired');
  await cancelBackupSearchSession(sessionId, renderer);
  expect(() => nextBackupSearchSession(sessionId, renderer)).toThrow('expired');
});

it('waits for the old worker to exit and clean before replacing a window session', async () => {
  const renderer = owner(4);
  await startBackupSearchSession('old', renderer);
  const worker = mocks.clients[0];
  let release: () => void = () => undefined;
  worker!.terminateGate = new Promise<void>((resolve) => { release = resolve; });

  const replacement = startBackupSearchSession('new', renderer);
  await Promise.resolve();
  expect(worker?.terminateCalls).toBe(1);
  expect(mocks.clients).toHaveLength(1);
  release();
  await replacement;
  expect(mocks.clients).toHaveLength(2);
});

it.each(['did-start-loading', 'destroyed', 'render-process-gone'])('cleans on owner %s', async (eventName) => {
  const renderer = owner(5) as unknown as FakeOwner;
  const { session_id: sessionId } = await startBackupSearchSession('needle', renderer as unknown as import('electron').WebContents);
  const directory = (mocks.clients[0]?.input as { sessionDirectory: string }).sessionDirectory;
  renderer.emit(eventName);
  await vi.waitFor(() => expect(mocks.clients[0]?.terminateCalls).toBe(1));
  await vi.waitFor(async () => expect(await fs.stat(directory).then(() => true, () => false)).toBe(false));
  expect(() => nextBackupSearchSession(sessionId, renderer as unknown as import('electron').WebContents)).toThrow('expired');
});

it('cleans a crashed worker session and private directory before surfacing the error', async () => {
  const renderer = owner(6);
  const { session_id: sessionId } = await startBackupSearchSession('needle', renderer);
  const worker = mocks.clients[0];
  const directory = (worker?.input as { sessionDirectory: string }).sessionDirectory;
  const next = nextBackupSearchSession(sessionId, renderer);
  await vi.waitFor(() => expect(worker?.pending).toHaveLength(1));
  worker?.pending.shift()?.reject(new Error('worker crash'));

  await expect(next).rejects.toThrow('worker crash');
  expect(worker?.terminateCalls).toBe(1);
  await expect(fs.stat(directory)).rejects.toThrow();
});

it('removes only private orphan session directories', async () => {
  const root = path.join(tempRoot, 'backup-search-sessions');
  await fs.mkdir(path.join(root, 'session-12345678-1234-1234-1234-123456789abc'), { recursive: true });
  await fs.mkdir(path.join(root, 'keep-me'), { recursive: true });
  await cleanupOrphanedBackupSearchSessions();
  await expect(fs.stat(path.join(root, 'session-12345678-1234-1234-1234-123456789abc'))).rejects.toThrow();
  await expect(fs.stat(path.join(root, 'keep-me'))).resolves.toBeDefined();
});
