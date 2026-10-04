import { promises as fs } from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { writeJson } from './companionLanResponses.js';
import { applyDesktopSyncIdentityArchive } from './desktopSyncIdentityArchiveApply.js';

export const SYNC_IDENTITY_PUSH_PATH = '/companion/sync-identity-push';
export const SYNC_IDENTITY_PUSH_REQUEST_LIMIT = 2 * 1024 * 1024;

function decodeArchive(bodyText: string) {
  let value: unknown;
  try { value = JSON.parse(bodyText) as unknown; }
  catch { throw new Error('sync_identity_push_invalid'); }
  const encoded = (value as { archive_base64url?: unknown })?.archive_base64url;
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(encoded) ||
      encoded.length > Math.ceil(DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes * 4 / 3)) {
    throw new Error('sync_identity_push_invalid');
  }
  const archive = Buffer.from(encoded, 'base64url');
  if (archive.length > DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes ||
      archive.toString('base64url') !== encoded) throw new Error('sync_identity_push_invalid');
  return archive;
}

export async function handleCompanionIdentityPushPost(request: http.IncomingMessage,
  response: http.ServerResponse, bodyText: string, peer: { device_id: string; device_name: string }) {
  const group = loadDesktopSyncGroup();
  if (!group) {
    writeJson(request, response, 409, { error: 'sync_group_local_device_missing' }, 'POST, OPTIONS');
    return;
  }
  let archive: Buffer;
  try { archive = decodeArchive(bodyText); }
  catch {
    writeJson(request, response, 400, { error: 'sync_identity_push_invalid' }, 'POST, OPTIONS');
    return;
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-push-'));
  try {
    const archivePath = path.join(tempRoot, 'received.zip');
    await fs.writeFile(archivePath, archive);
    const result = await applyDesktopSyncIdentityArchive({
      archivePath, incomingPath: path.join(tempRoot, 'incoming.db'),
      sourcePeerId: peer.device_id, targetPeerId: group.local_device_identity_key,
      sourceHostName: peer.device_name
    });
    writeJson(request, response, 200, result, 'POST, OPTIONS');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync_identity_push_failed';
    if (!message.startsWith('sync_identity_') && !message.startsWith('invalid_sync_pack_')) {
      throw error;
    }
    writeJson(request, response, 409, { error: message }, 'POST, OPTIONS');
  } finally { await fs.rm(tempRoot, { recursive: true, force: true }); }
}
