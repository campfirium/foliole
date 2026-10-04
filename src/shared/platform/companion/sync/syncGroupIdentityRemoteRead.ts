import { validateSyncIdentityChangedRemotePage,
  type SyncIdentityChangedCursor,
  type SyncIdentityChangedRemotePage } from '../../../../../lib/core/sync/syncIdentityChangedPage';
import type { SyncIdentityPage,
  SyncIdentitySummaryRow } from '../../../../../lib/core/sync/syncIdentityDiff';
import type { SyncIdentityNodeFactSection } from '../../../../../lib/core/sync/syncIdentityNodeFactPage';
import type { SyncIdentityGlobalPage,
  SyncIdentityInventory } from '../../../../../lib/core/sync/syncIdentityPagedDiff';
import { isSyncIdentitySourceEpoch } from '../../../../../lib/core/sync/syncIdentitySourceEpoch';
import { fetchDesktopJson } from '../../companionDesktopSyncHttp';

export interface CompanionIdentityRemoteSummary {
  contract: string;
  partitions: SyncIdentitySummaryRow[];
  source_epoch: string;
  source_view_id: string;
  watermark: string;
}

export interface CompanionIdentityGlobalSummary {
  contract: string;
  inventory: SyncIdentityInventory;
  source_epoch: string;
  source_view_id: string;
  watermark: string;
}

export interface CompanionIdentityRemotePage extends SyncIdentityPage {
  contract: string;
  partition: number;
  source_view_id: string;
}

export interface CompanionIdentityFactEntry {
  fingerprint: string;
  object_id: string;
  object_type: 'node';
  state_fingerprint: string;
}

export interface CompanionIdentityRemoteFactPage extends Omit<CompanionIdentityRemotePage, 'entries'> {
  entries: CompanionIdentityFactEntry[];
}

function pagePath(kind: 'identity' | 'fact', viewId: string, partition: number,
  after: SyncIdentityPage['nextAfter'], restoreId?: string) {
  const query = new URLSearchParams({ source_view_id: viewId, partition: String(partition) });
  if (restoreId) query.set('restore_id', restoreId);
  if (after) {
    query.set('after_type', after.object_type);
    query.set('after_id', after.object_id);
  }
  const endpoint = kind === 'identity' ? 'sync-identity-page' : 'sync-identity-fact-page';
  return `/companion/${endpoint}?${query}`;
}

export async function readCompanionRemoteIdentitySummary(endpointUrl: string) {
  const summary = await fetchDesktopJson<CompanionIdentityRemoteSummary>(endpointUrl,
    '/companion/sync-identity-summary');
  if (summary.contract !== 'global-id-v1' ||
      !isSyncIdentitySourceEpoch(summary.source_epoch) ||
      typeof summary.watermark !== 'string' || summary.watermark.length > 128 ||
      !/^[a-f0-9-]{36}$/u.test(summary.source_view_id)) {
    throw new Error('sync_identity_remote_contract_invalid');
  }
  return summary;
}

export async function readCompanionRemoteIdentityGlobalSummary(endpointUrl: string) {
  const summary = await fetchDesktopJson<CompanionIdentityGlobalSummary>(endpointUrl,
    '/companion/sync-identity-global-summary');
  if (summary.contract !== 'global-id-v2' ||
      !isSyncIdentitySourceEpoch(summary.source_epoch) ||
      typeof summary.watermark !== 'string' || summary.watermark.length > 128 ||
      !/^[a-f0-9-]{36}$/u.test(summary.source_view_id)) {
    throw new Error('sync_identity_remote_contract_invalid');
  }
  return summary;
}

export async function readCompanionRemoteIdentityGlobalPage(endpointUrl: string,
  viewId: string, after: SyncIdentityGlobalPage['nextAfter'], restoreId?: string) {
  const query = new URLSearchParams({ source_view_id: viewId });
  if (restoreId) query.set('restore_id', restoreId);
  if (after) {
    query.set('after_type', after.object_type);
    query.set('after_id', after.object_id);
  }
  const page = await fetchDesktopJson<SyncIdentityGlobalPage & {
    contract: string; source_view_id: string }>(endpointUrl,
  `/companion/sync-identity-global-page?${query}`);
  if (page.contract !== 'global-id-v2' || page.source_view_id !== viewId) {
    throw new Error('sync_identity_remote_page_changed');
  }
  return page;
}

export async function readCompanionRemoteIdentityPage(endpointUrl: string,
  viewId: string, partition: number, after: SyncIdentityPage['nextAfter'], restoreId?: string) {
  const page = await fetchDesktopJson<CompanionIdentityRemotePage>(endpointUrl,
    pagePath('identity', viewId, partition, after, restoreId));
  if (page.contract !== 'global-id-v1' || page.partition !== partition ||
      page.source_view_id !== viewId) throw new Error('sync_identity_remote_page_changed');
  return page;
}

export async function readCompanionRemoteFactSummary(endpointUrl: string, viewId: string) {
  const summary = await fetchDesktopJson<{ contract: string; inventory: SyncIdentityInventory;
    proof_root: string; source_view_id: string }>(endpointUrl, '/companion/sync-identity-fact-summary?' +
      new URLSearchParams({ source_view_id: viewId }));
  if (summary.contract !== 'global-id-v2' || summary.source_view_id !== viewId ||
      !/^[a-f0-9]{64}$/u.test(summary.proof_root)) {
    throw new Error('sync_identity_remote_fact_view_changed');
  }
  return summary;
}

export async function readCompanionRemoteFactPage(endpointUrl: string, viewId: string,
  after: SyncIdentityPage['nextAfter']) {
  const query = new URLSearchParams({ source_view_id: viewId });
  if (after) { query.set('after_type', after.object_type); query.set('after_id', after.object_id); }
  const page = await fetchDesktopJson<CompanionIdentityRemoteFactPage>(endpointUrl,
    `/companion/sync-identity-fact-global-page?${query}`);
  if (page.contract !== 'global-id-v2' ||
      page.source_view_id !== viewId || page.entries.some((entry) =>
        entry.object_type !== 'node' || !/^[a-f0-9]{64}$/u.test(entry.state_fingerprint))) {
    throw new Error('sync_identity_remote_fact_page_invalid');
  }
  return page;
}

export async function readCompanionRemoteNodeFacts(endpointUrl: string, viewId: string,
  nodeId: string, section: SyncIdentityNodeFactSection, after: string | null) {
  const query = new URLSearchParams({ source_view_id: viewId,
    node_id: nodeId, section });
  if (after !== null) query.set('after', after);
  const page = await fetchDesktopJson<Record<string, unknown>>(endpointUrl,
    `/companion/sync-identity-node-facts?${query}`);
  if (page.contract !== 'global-id-v1' || page.source_view_id !== viewId) {
    throw new Error('sync_identity_remote_fact_view_changed');
  }
  return page;
}

export async function readCompanionRemoteChangedPage(endpointUrl: string, viewId: string,
  since: string, after: SyncIdentityChangedCursor | null) {
  const query = new URLSearchParams({ source_view_id: viewId, since });
  if (after) {
    query.set('after_updated_at', after.updated_at);
    query.set('after_type', after.object_type);
    query.set('after_id', after.object_id);
  }
  const page = await fetchDesktopJson<SyncIdentityChangedRemotePage>(endpointUrl,
    `/companion/sync-identity-changed-page?${query}`);
  validateSyncIdentityChangedRemotePage(page, viewId, after);
  return page;
}
