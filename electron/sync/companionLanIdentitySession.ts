import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';
import {
  createSyncIdentitySourceView, openSyncIdentitySourceView
} from '../database/syncIdentitySourceView.js';

import { sessionRoot } from './companionLanDependencySession.js';

const restoreViewPromises = new Map<string, Promise<string>>();

function identityRoot(groupId: string, peerId: string, restoreId?: string) {
  if (restoreId !== undefined && (!restoreId || restoreId.trim() !== restoreId ||
      restoreId.length > 256)) throw new Error('sync_identity_restore_id_invalid');
  const root = path.join(sessionRoot(groupId, peerId), '.identity-views');
  return restoreId ? path.join(root, `.restore-${createHash('sha256').update(restoreId)
    .digest('hex')}`) : root;
}

export async function createCompanionIdentitySession(groupId: string, peerId: string,
  restoreId?: string) {
  const root = identityRoot(groupId, peerId, restoreId);
  await fs.mkdir(root, { recursive: true });
  if (restoreId) {
    let pending = restoreViewPromises.get(root);
    if (!pending) {
      pending = ensureRestoreView(root);
      restoreViewPromises.set(root, pending);
      void pending.catch(() => restoreViewPromises.delete(root));
    }
    return openCompanionIdentitySession(groupId, peerId, await pending, restoreId);
  }
  const viewId = await createIdentityView(root);
  await pruneIdentitySessions(root, viewId);
  return openCompanionIdentitySession(groupId, peerId, viewId);
}

async function ensureRestoreView(root: string) {
  const views = (await fs.readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[a-f0-9-]{36}$/u.test(entry.name));
  if (views.length > 0) {
    const dated = await Promise.all(views.map(async (entry) => ({ name: entry.name,
      created: (await fs.stat(path.join(root, entry.name))).birthtimeMs })));
    dated.sort((left, right) => left.created - right.created ||
      left.name.localeCompare(right.name));
    return dated[0]!.name;
  }
  return createIdentityView(root);
}

async function createIdentityView(root: string) {
  const staging = await fs.mkdtemp(path.join(root, '.preparing-'));
  try {
    const view = await createSyncIdentitySourceView(openDatabaseConnection().sqlite,
      path.join(staging, 'source.db'));
    const viewId = view.sourceViewId;
    view.close();
    await fs.rename(staging, path.join(root, viewId));
    return viewId;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

export function openCompanionIdentitySession(groupId: string, peerId: string, viewId: string,
  restoreId?: string) {
  if (!/^[a-f0-9-]{36}$/u.test(viewId)) throw new Error('sync_identity_source_view_invalid');
  try {
    return openSyncIdentitySourceView(path.join(identityRoot(groupId, peerId, restoreId),
      viewId, 'source.db'), viewId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'SQLITE_CANTOPEN' ||
        (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('sync_identity_source_view_unavailable');
    }
    throw error;
  }
}

async function pruneIdentitySessions(root: string, currentId: string) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const views = await Promise.all(entries.filter((entry) => entry.isDirectory() &&
    /^[a-f0-9-]{36}$/u.test(entry.name)).map(async (entry) => ({
    name: entry.name, modified: (await fs.stat(path.join(root, entry.name))).mtimeMs
  })));
  views.sort((left, right) => right.modified - left.modified);
  for (const view of views.slice(2)) {
    if (view.name === currentId) continue;
    try { await fs.rm(path.join(root, view.name), { recursive: true, force: true }); }
    catch (error) {
      if (!['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  }
}
