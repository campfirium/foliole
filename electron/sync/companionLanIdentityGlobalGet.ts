import type http from 'node:http';

import { readReadySyncIdentityGlobalPage,
  readReadySyncIdentityInventory } from '../../lib/core/sync/syncIdentityGlobalRead.js';
import { readReadySyncIdentityWatermark } from '../../lib/core/sync/syncIdentityIndexMaintenance.js';
import { readSyncIdentityNodeFactGlobalPage } from '../../lib/core/sync/syncIdentityNodeFactGlobalRead.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { assertDesktopIdentityRestoreSource } from './companionLanIdentityRestore.js';
import { createCompanionIdentitySession,
  openCompanionIdentitySession } from './companionLanIdentitySession.js';
import { writeJson } from './companionLanResponses.js';

export const SYNC_IDENTITY_GLOBAL_SUMMARY_PATH = '/companion/sync-identity-global-summary';
export const SYNC_IDENTITY_FACT_GLOBAL_PAGE_PATH = '/companion/sync-identity-fact-global-page';
export const SYNC_IDENTITY_GLOBAL_PAGE_PATH = '/companion/sync-identity-global-page';

export async function handleCompanionIdentityGlobalGet(request: http.IncomingMessage,
  response: http.ServerResponse, url: URL, peerId: string) {
  if (![SYNC_IDENTITY_GLOBAL_SUMMARY_PATH, SYNC_IDENTITY_GLOBAL_PAGE_PATH, SYNC_IDENTITY_FACT_GLOBAL_PAGE_PATH]
    .includes(url.pathname)) return false;
  try {
    await serveGlobalGet(request, response, url, peerId);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const code = error.message;
    if (['sync_identity_request_invalid', 'sync_identity_global_page_invalid',
      'sync_identity_source_view_invalid'].includes(code)) {
      writeJson(request, response, 400, { error: code }, 'GET, OPTIONS');
    } else if (['sync_identity_source_view_unavailable',
      'sync_identity_source_view_changed', 'sync_identity_restore_source_mismatch',
      'sync_identity_global_item_too_large'].includes(code)) {
      writeJson(request, response, 409, { error: code }, 'GET, OPTIONS');
    } else throw error;
  }
  return true;
}

async function serveGlobalGet(request: http.IncomingMessage,
  response: http.ServerResponse, url: URL, peerId: string) {
  const group = loadDesktopSyncGroup();
  if (!group) {
    writeJson(request, response, 409, { error: 'sync_group_local_device_missing' }, 'GET, OPTIONS');
    return;
  }
  const restoreId = url.searchParams.get('restore_id') ?? undefined;
  if (restoreId) assertDesktopIdentityRestoreSource({ groupId: group.group_id,
    localDeviceId: group.local_device_identity_key, restoreId });
  if (url.pathname === SYNC_IDENTITY_GLOBAL_SUMMARY_PATH) {
    if (url.search) throw new Error('sync_identity_request_invalid');
    const view = await createCompanionIdentitySession(group.group_id, peerId);
    try {
      const inventory = await readReadySyncIdentityInventory(view.port);
      const watermark = await readReadySyncIdentityWatermark(view.port);
      writeJson(request, response, 200, { contract: 'global-id-v2',
        source_view_id: view.sourceViewId, source_epoch: view.sourceEpoch,
        watermark, inventory }, 'GET, OPTIONS');
    } finally { view.close(); }
    return;
  }
  const viewId = url.searchParams.get('source_view_id');
  const objectType = url.searchParams.get('after_type');
  const objectId = url.searchParams.get('after_id');
  if (!viewId || !/^[a-f0-9-]{36}$/u.test(viewId) ||
      (objectType === null) !== (objectId === null)) {
    throw new Error('sync_identity_request_invalid');
  }
  const view = openCompanionIdentitySession(group.group_id, peerId, viewId, restoreId);
  try {
    const after = objectType === null ? null : { object_type: objectType, object_id: objectId! };
    const result = url.pathname === SYNC_IDENTITY_FACT_GLOBAL_PAGE_PATH
      ? await readSyncIdentityNodeFactGlobalPage(view.port, after)
      : await readReadySyncIdentityGlobalPage(view.port, after);
    writeJson(request, response, 200, { contract: 'global-id-v2',
      source_view_id: view.sourceViewId, ...result }, 'GET, OPTIONS');
  } finally { view.close(); }
}
