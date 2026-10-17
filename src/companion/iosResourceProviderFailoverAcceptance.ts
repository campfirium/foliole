import { resolveRuntimeAttachmentResource } from '../shared/platform/attachmentResources';
import { loadCompanionResourceProviders } from '../shared/platform/companion/network/companionResourceProviders';
import { exchangeCompanionSyncGroupMemberState } from '../shared/platform/companion/network/companionSyncGroupMemberState';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { completeCompanionSyncGroupJoin, requestCompanionSyncGroupJoin } from '../shared/platform/companionSyncGroupJoinClient';
import { loadCompanionDiscoveryCandidates } from '../shared/platform/companionWorkspaceDiscovery';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { loadCompanionReadableArticle, saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { syncIosAcceptanceRequest } from './iosAcceptanceRequestSync';
import { postResult } from './iosBridgeAcceptance';

const SCENARIO = 'resource-provider-failover';
const GROUP_ID = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_GROUP_ID;
const MAC_ID = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_MAC_ID;
const A5_ID = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_A5_ID;
const NODE_ID = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_NODE_ID;
const IMAGE_HASH = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_IMAGE_HASH;

async function discoverMac() {
  const native = await FolioleCompanionSync.loadDiscoveryCandidates();
  const candidates = native.candidates.map((candidate) => ({
    endpointUrl: candidate.endpoint_url, protocolTxt: candidate.protocol_txt ?? null,
    source: candidate.source
  }));
  const matches = (await loadCompanionDiscoveryCandidates(candidates)).filter((candidate) =>
    candidate.compatibility.status === 'compatible' && candidate.discovery.group_id === GROUP_ID &&
    candidate.discovery.provider_device_id === MAC_ID);
  if (matches.length !== 1) throw new Error(`acceptance_mac_discovery_count_${matches.length}`);
  return matches[0]!;
}

async function joinMac(discovered: Awaited<ReturnType<typeof discoverMac>>, databasePath: string) {
  const pending = await requestCompanionSyncGroupJoin({ mode: 'use-group', databasePath,
    endpointUrl: discovered.endpointUrl, groupId: GROUP_ID });
  postResult({ error: null, phase: 'join-requested', request_id: pending.request_id,
    scenario: SCENARIO, status: 'passed' });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      return await completeCompanionSyncGroupJoin({ databasePath,
        endpointUrl: discovered.endpointUrl,
        providerDeviceId: discovered.discovery.provider_device_id,
        providerDeviceName: discovered.discovery.provider_device_name,
        providerPlatform: discovered.discovery.provider_platform,
        requestId: pending.request_id });
    } catch (error) {
      if (!String(error).includes('sync_group_join_acceptance_http_')) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
  }
  throw new Error('acceptance_join_timeout');
}

async function loadBothProviders(endpointUrl: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await loadCompanionResourceProviders(endpointUrl);
    if (result.providers.some((provider) => provider.deviceId === MAC_ID) &&
        result.providers.some((provider) => provider.deviceId === A5_ID)) return result.providers;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error('acceptance_independent_a5_provider_not_discovered');
}

class ReadEvidenceError extends Error {
  constructor(readonly evidence: {
    expected: string; bodyStatus: string | null; content: string | null;
    resourceStatus: string | null; resourceUrl: string | null;
  }) { super('acceptance_article_or_attachment_unreadable'); }
}

async function verifyRead(expected: 'ready' | 'missing_file' = 'ready') {
  const article = await loadCompanionReadableArticle(undefined, NODE_ID);
  const resource = await resolveRuntimeAttachmentResource(`asset://${IMAGE_HASH}.png`, { refresh: true });
  if (expected === 'missing_file' && resource?.status === 'ready') {
    throw new Error('acceptance_attachment_already_available');
  }
  if (article?.bodyStatus !== 'ready' || !article.content.includes('Resource LAN body remains readable.') ||
      !article.content.includes(`asset://${IMAGE_HASH}.png`) || resource?.status !== expected ||
      (expected === 'ready' && !resource.resource_url)) {
    throw new ReadEvidenceError({ expected, bodyStatus: article?.bodyStatus ?? null, content: article?.content ?? null,
      resourceStatus: resource?.status ?? null, resourceUrl: resource?.resource_url ?? null });
  }
  return { article_body_status: article.bodyStatus, attachment_status: resource.status,
    resource_url: resource.resource_url };
}

export async function runIosResourceProviderFailoverAcceptance() {
  let step = 'bootstrap';
  try {
    if (!GROUP_ID || !MAC_ID || !A5_ID || !NODE_ID || !/^[a-f0-9]{64}$/u.test(IMAGE_HASH)) {
      throw new Error('acceptance_fixture_identity_missing');
    }
    const bootstrap = await loadCompanionBootstrapState();
    if (!bootstrap.database_path) throw new Error('acceptance_database_missing');
    const discovered = await discoverMac();
    const existing = await loadCompanionSyncGroup();
    if (existing) {
      if (existing.group_id !== GROUP_ID) throw new Error('acceptance_group_changed_on_restart');
      step = 'restart-read';
      postResult({ error: null, evidence: await verifyRead(), phase: 'restart-clean',
        scenario: SCENARIO, status: 'passed' });
      return;
    }
    await joinMac(discovered, bootstrap.database_path);
    await saveCompanionWorkspaceSyncEndpoint(discovered.endpointUrl);
    await exchangeCompanionSyncGroupMemberState({ deviceId: MAC_ID, endpointUrl: discovered.endpointUrl,
      groupId: GROUP_ID });
    const providers = await loadBothProviders(discovered.endpointUrl);
    const mac = providers.find(provider => provider.deviceId === MAC_ID);
    const a5 = providers.find(provider => provider.deviceId === A5_ID);
    if (!mac || !a5) throw new Error('acceptance_required_provider_missing');
    const beforeMac = await resolveRuntimeAttachmentResource(`asset://${IMAGE_HASH}.png`, { refresh: true });
    if (beforeMac?.status === 'ready') throw new Error('acceptance_attachment_already_available');
    step = 'mac-request';
    await syncIosAcceptanceRequest(mac.endpointUrl, { sourcePeerId: mac.deviceId });
    step = 'after-mac-read';
    const afterMac = await verifyRead('missing_file');
    const beforeA5 = await verifyRead('missing_file');
    step = 'a5-request';
    await syncIosAcceptanceRequest(a5.endpointUrl, { sourcePeerId: a5.deviceId }, true);
    step = 'after-a5-read';
    const afterA5 = await verifyRead();
    postResult({ transfers: [
      { device_id: mac.deviceId, endpoint: mac.endpointUrl,
        before: { attachment_status: beforeMac?.status ?? null, resource_url: beforeMac?.resource_url ?? null }, after: afterMac },
      { device_id: a5.deviceId, endpoint: a5.endpointUrl, before: beforeA5, after: afterA5 }
    ], error: null, evidence: afterA5, phase: 'provider-selected', scenario: SCENARIO, status: 'passed' });
  } catch (error) {
    postResult({ error: error instanceof Error ? error.message : String(error),
      ...(error instanceof ReadEvidenceError ? { evidence: error.evidence } : {}),
      step, phase: 'failed', scenario: SCENARIO, status: 'failed' });
  }
}
