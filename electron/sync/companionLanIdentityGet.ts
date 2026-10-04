import type http from 'node:http';

import { readReadySyncIdentityChangedPage } from '../../lib/core/sync/syncIdentityChangedPage.js';
import {
  readReadySyncIdentityPage, readReadySyncIdentitySummary,
  readReadySyncIdentityWatermark
} from '../../lib/core/sync/syncIdentityIndexMaintenance.js';
import { readSyncIdentityNodeFactInventory } from '../../lib/core/sync/syncIdentityNodeFactGlobalRead.js';
import { readSyncIdentityNodeFactPage,
  readSyncIdentityNodeFactProofRoot,
  } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { readSyncIdentityNodeFactDescriptorPage,
  type SyncIdentityNodeFactSection } from '../../lib/core/sync/syncIdentityNodeFactPage.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { handleCompanionIdentityGlobalGet } from './companionLanIdentityGlobalGet.js';
import { assertDesktopIdentityRestoreSource, serveDesktopIdentityRestoreSet,
  SYNC_IDENTITY_RESTORE_SET_PATH } from './companionLanIdentityRestore.js';
import {
  createCompanionIdentitySession, openCompanionIdentitySession
} from './companionLanIdentitySession.js';
import { writeJson } from './companionLanResponses.js';

export const SYNC_IDENTITY_SUMMARY_PATH = '/companion/sync-identity-summary';
export const SYNC_IDENTITY_PAGE_PATH = '/companion/sync-identity-page';
export const SYNC_IDENTITY_FACT_SUMMARY_PATH = '/companion/sync-identity-fact-summary';
export const SYNC_IDENTITY_FACT_PAGE_PATH = '/companion/sync-identity-fact-page';
export const SYNC_IDENTITY_NODE_FACTS_PATH = '/companion/sync-identity-node-facts';
export const SYNC_IDENTITY_CHANGED_PAGE_PATH = '/companion/sync-identity-changed-page';

function parseChangedRequest(url: URL) {
  const viewId = url.searchParams.get('source_view_id');
  const since = url.searchParams.get('since');
  const updatedAt = url.searchParams.get('after_updated_at');
  const objectType = url.searchParams.get('after_type');
  const objectId = url.searchParams.get('after_id');
  if (!viewId || !/^[a-f0-9-]{36}$/u.test(viewId) || since === null ||
      since.length > 128 || [updatedAt, objectType, objectId].filter((item) => item !== null)
        .length % 3 !== 0) throw new Error('sync_identity_request_invalid');
  return { viewId, since, after: updatedAt === null ? null :
    { updated_at: updatedAt, object_type: objectType!, object_id: objectId! } };
}

async function serveChangedPage(request: http.IncomingMessage,
  response: http.ServerResponse, url: URL, groupId: string, peerId: string,
  restoreId?: string) {
  const changed = parseChangedRequest(url);
  const view = openCompanionIdentitySession(groupId, peerId, changed.viewId, restoreId);
  try {
    const result = await readReadySyncIdentityChangedPage(view.port,
      changed.since, changed.after);
    writeJson(request, response, 200, { contract: 'global-id-v1',
      source_view_id: view.sourceViewId, ...result }, 'GET, OPTIONS');
  } finally { view.close(); }
}

async function serveIdentitySummary(request: http.IncomingMessage,
  response: http.ServerResponse, url: URL, groupId: string, peerId: string) {
  if (url.search) throw new Error('sync_identity_request_invalid');
  const view = await createCompanionIdentitySession(groupId, peerId);
  try {
    const partitions = await readReadySyncIdentitySummary(view.port);
    const watermark = await readReadySyncIdentityWatermark(view.port);
    writeJson(request, response, 200, { contract: 'global-id-v1',
      source_view_id: view.sourceViewId, source_epoch: view.sourceEpoch,
      watermark, partitions }, 'GET, OPTIONS');
  } finally { view.close(); }
}


function parsePageRequest(url: URL) {
  const partitionText = url.searchParams.get('partition');
  const partition = Number(partitionText);
  const viewId = url.searchParams.get('source_view_id');
  const objectType = url.searchParams.get('after_type');
  const objectId = url.searchParams.get('after_id');
  if (!viewId || !/^[a-f0-9-]{36}$/u.test(viewId) || partitionText === null ||
      !/^(?:0|[1-9]\d{0,2})$/u.test(partitionText) || partition > 255 ||
      (objectType === null) !== (objectId === null) ||
      (objectType !== null && (!objectType || !objectId ||
        objectType.length > 128 || objectId.length > 2048))) {
    throw new Error('sync_identity_request_invalid');
  }
  return { partition, viewId, after: objectType === null ? null :
    { object_type: objectType, object_id: objectId! } };
}

function parseNodeFactsRequest(url: URL) {
  const viewId = url.searchParams.get('source_view_id');
  const nodeId = url.searchParams.get('node_id');
  const section = url.searchParams.get('section');
  const after = url.searchParams.get('after');
  if (!viewId || !/^[a-f0-9-]{36}$/u.test(viewId) || !nodeId ||
      nodeId.length > 2048 || !['versions', 'parents', 'reviews', 'requirements'].includes(
        section ?? '') || after !== null && (!after || after.length > 4096)) {
    throw new Error('sync_identity_node_fact_request_invalid');
  }
  return { viewId, nodeId, section: section as SyncIdentityNodeFactSection, after };
}

async function serveNodeFacts(request: http.IncomingMessage,
  response: http.ServerResponse, url: URL, groupId: string, peerId: string,
  restoreId?: string) {
  const facts = parseNodeFactsRequest(url);
  const view = openCompanionIdentitySession(groupId, peerId, facts.viewId, restoreId);
  try {
    const result = await readSyncIdentityNodeFactDescriptorPage(view.port, {
      nodeId: facts.nodeId, section: facts.section, after: facts.after
    });
    writeJson(request, response, 200, { contract: 'global-id-v1',
      source_view_id: view.sourceViewId, ...result }, 'GET, OPTIONS');
  } finally { view.close(); }
}

async function serveFactSummary(request: http.IncomingMessage,
  response: http.ServerResponse, url: URL, groupId: string, peerId: string,
  restoreId?: string) {
  const viewId = url.searchParams.get('source_view_id');
  if (!viewId || !/^[a-f0-9-]{36}$/u.test(viewId)) {
    throw new Error('sync_identity_request_invalid');
  }
  const view = openCompanionIdentitySession(groupId, peerId, viewId, restoreId);
  try {
    const inventory = await readSyncIdentityNodeFactInventory(view.port);
    const proofRoot = await readSyncIdentityNodeFactProofRoot(view.port);
    writeJson(request, response, 200, { contract: 'global-id-v2',
      source_view_id: view.sourceViewId, proof_root: proofRoot,
      inventory }, 'GET, OPTIONS');
  } finally { view.close(); }
}

async function serveIdentityPage(request: http.IncomingMessage,
  response: http.ServerResponse, url: URL, groupId: string, peerId: string,
  restoreId?: string) {
  const page = parsePageRequest(url);
  const view = openCompanionIdentitySession(groupId, peerId, page.viewId, restoreId);
  try {
    if (url.pathname === SYNC_IDENTITY_FACT_PAGE_PATH &&
        page.after && page.after.object_type !== 'node') {
      throw new Error('sync_identity_request_invalid');
    }
    const result = url.pathname === SYNC_IDENTITY_FACT_PAGE_PATH
      ? await readSyncIdentityNodeFactPage(view.port, page.partition, page.after?.object_id ?? null)
      : await readReadySyncIdentityPage(view.port, page.partition, page.after);
    writeJson(request, response, 200, { contract: 'global-id-v1',
      source_view_id: view.sourceViewId, partition: page.partition, ...result }, 'GET, OPTIONS');
  } finally { view.close(); }
}

export async function handleCompanionIdentityGet(request: http.IncomingMessage,
  response: http.ServerResponse, url: URL, peerId: string) {
  if (await handleCompanionIdentityGlobalGet(request, response, url, peerId)) return true;
  if (![SYNC_IDENTITY_SUMMARY_PATH, SYNC_IDENTITY_PAGE_PATH, SYNC_IDENTITY_RESTORE_SET_PATH,
    SYNC_IDENTITY_FACT_SUMMARY_PATH, SYNC_IDENTITY_FACT_PAGE_PATH,
    SYNC_IDENTITY_NODE_FACTS_PATH,
    SYNC_IDENTITY_CHANGED_PAGE_PATH].includes(url.pathname)) return false;
  const group = loadDesktopSyncGroup();
  if (!group) {
    writeJson(request, response, 409, { error: 'sync_group_local_device_missing' }, 'GET, OPTIONS');
    return true;
  }
  try {
    const restoreId = url.searchParams.get('restore_id') ?? undefined;
    if (url.pathname === SYNC_IDENTITY_RESTORE_SET_PATH &&
        (url.searchParams.size !== 1 || !restoreId)) {
      throw new Error('sync_identity_request_invalid');
    }
    if (restoreId) assertDesktopIdentityRestoreSource({ groupId: group.group_id,
      localDeviceId: group.local_device_identity_key, restoreId });
    if (url.pathname === SYNC_IDENTITY_RESTORE_SET_PATH) {
      await serveDesktopIdentityRestoreSet({ groupId: group.group_id,
        localDeviceId: group.local_device_identity_key, peerId,
        request, response, restoreId: restoreId! });
      return true;
    }
    if (url.pathname === SYNC_IDENTITY_SUMMARY_PATH) {
      await serveIdentitySummary(request, response, url, group.group_id, peerId);
      return true;
    }
    if (url.pathname === SYNC_IDENTITY_FACT_SUMMARY_PATH) {
      await serveFactSummary(request, response, url, group.group_id, peerId, restoreId);
      return true;
    }
    if (url.pathname === SYNC_IDENTITY_CHANGED_PAGE_PATH) {
      await serveChangedPage(request, response, url, group.group_id, peerId, restoreId);
      return true;
    }
    if (url.pathname === SYNC_IDENTITY_NODE_FACTS_PATH) {
      await serveNodeFacts(request, response, url, group.group_id, peerId, restoreId);
      return true;
    }
    await serveIdentityPage(request, response, url, group.group_id, peerId, restoreId);
  } catch (error) {
    if (error instanceof Error && ['sync_identity_request_invalid', 'sync_identity_fact_page_invalid',
      'sync_identity_restore_id_invalid',
      'sync_identity_node_fact_request_invalid', 'sync_identity_node_fact_cursor_invalid',
      'sync_identity_changed_page_invalid',
      'sync_identity_source_view_invalid'].includes(error.message)) {
      writeJson(request, response, 400, { error: error.message }, 'GET, OPTIONS');
    } else if (error instanceof Error && ['sync_identity_source_view_unavailable',
      'sync_identity_source_view_changed', 'sync_identity_restore_source_mismatch',
      'sync_identity_fact_page_too_large',
      'sync_identity_node_fact_missing', 'sync_identity_node_fact_item_too_large',
      'sync_identity_changed_item_too_large'].includes(error.message)) {
      writeJson(request, response, 409, { error: error.message }, 'GET, OPTIONS');
    } else throw error;
  }
  return true;
}
