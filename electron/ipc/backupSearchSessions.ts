import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { app, type WebContents } from 'electron';

import type { NativeBackupSearchNextResult } from '../../lib/platform/nativeBackupSearchContract.js';
import { listApplicationDatabaseBackups } from '../database/backupRestore.js';

import { BackupSearchWorkerClient } from './backupSearchWorkerClient.js';

interface BackupSearchSession {
  cancelled: boolean;
  client: BackupSearchWorkerClient;
  directory: string;
  id: string;
  nextTail: Promise<unknown>;
  owner: WebContents;
  ownerCleanup: () => void;
}

const sessions = new Map<string, BackupSearchSession>();
const sessionIdsByOwner = new Map<number, string>();
let lifecycleTail = Promise.resolve<unknown>(undefined);

function searchRoot() {
  return path.join(app.getPath('userData'), 'backup-search-sessions');
}

function serializeLifecycle<T>(run: () => Promise<T>) {
  const result = lifecycleTail.then(run, run);
  lifecycleTail = result.catch(() => undefined);
  return result;
}

async function removeSessionDirectory(directory: string) {
  await fs.rm(directory, { force: true, recursive: true });
}

function detachOwner(session: BackupSearchSession) {
  session.owner.removeListener('destroyed', session.ownerCleanup);
  session.owner.removeListener('did-start-loading', session.ownerCleanup);
  session.owner.removeListener('render-process-gone', session.ownerCleanup);
}

async function cancelSessionInternal(session: BackupSearchSession) {
  if (session.cancelled) return;
  session.cancelled = true;
  detachOwner(session);
  if (sessions.get(session.id) === session) sessions.delete(session.id);
  if (sessionIdsByOwner.get(session.owner.id) === session.id) sessionIdsByOwner.delete(session.owner.id);
  try {
    await session.client.terminate();
  } finally {
    await removeSessionDirectory(session.directory);
  }
}

function bindOwner(session: BackupSearchSession) {
  session.owner.once('destroyed', session.ownerCleanup);
  session.owner.once('did-start-loading', session.ownerCleanup);
  session.owner.once('render-process-gone', session.ownerCleanup);
}

export async function cleanupOrphanedBackupSearchSessions() {
  const root = searchRoot();
  await fs.mkdir(root, { recursive: true });
  const active = new Set([...sessions.values()].map((session) => path.resolve(session.directory)));
  const entries = await fs.readdir(root, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory() || !/^session-[0-9a-f-]{36}$/u.test(entry.name)) return;
    const directory = path.join(root, entry.name);
    if (!active.has(path.resolve(directory))) await removeSessionDirectory(directory);
  }));
}

export function startBackupSearchSession(query: string, owner: WebContents) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return Promise.reject(new Error('invalid argument: query'));
  if (owner.isDestroyed()) return Promise.reject(new Error('backup search window is unavailable'));
  return serializeLifecycle(async () => {
    const existingId = sessionIdsByOwner.get(owner.id);
    const existing = existingId ? sessions.get(existingId) : null;
    if (existing) await cancelSessionInternal(existing);
    await cleanupOrphanedBackupSearchSessions();
    const backups = await listApplicationDatabaseBackups();
    const id = randomUUID();
    const directory = await fs.mkdtemp(path.join(searchRoot(), 'session-'));
    const client = new BackupSearchWorkerClient({ backups, query: normalizedQuery, sessionDirectory: directory });
    const session: BackupSearchSession = {
      cancelled: false,
      client,
      directory,
      id,
      nextTail: Promise.resolve(),
      owner,
      ownerCleanup: () => { void cancelBackupSearchSession(id); }
    };
    sessions.set(id, session);
    sessionIdsByOwner.set(owner.id, id);
    bindOwner(session);
    return { session_id: id };
  });
}

function ownedSession(id: string, owner: WebContents) {
  const session = sessions.get(id);
  if (!session || session.cancelled || session.owner !== owner) {
    throw new Error('backup search session is expired');
  }
  return session;
}

export function nextBackupSearchSession(id: string, owner: WebContents): Promise<NativeBackupSearchNextResult> {
  const session = ownedSession(id, owner);
  const next = session.nextTail.catch(() => undefined).then(async () => {
    ownedSession(id, owner);
    try {
      return await session.client.next();
    } catch (error) {
      await serializeLifecycle(() => cancelSessionInternal(session));
      throw error;
    }
  });
  session.nextTail = next;
  return next;
}

export function cancelBackupSearchSession(id: string, owner?: WebContents) {
  return serializeLifecycle(async () => {
    const session = sessions.get(id);
    if (!session || (owner && session.owner !== owner)) {
      if (owner) throw new Error('backup search session is expired');
      return;
    }
    await cancelSessionInternal(session);
  });
}

export async function disposeBackupSearchSessions() {
  await serializeLifecycle(async () => {
    await Promise.all([...sessions.values()].map(cancelSessionInternal));
  });
}
