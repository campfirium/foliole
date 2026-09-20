import { RESOURCE_AVAILABILITY_PATH, type ResourceAvailabilityReply } from '../../lib/platform/resourceAvailabilityContract';
import { resolveRuntimeAttachmentResource } from '../shared/platform/attachmentResources';
import { loadCompanionResourceProviders } from '../shared/platform/companion/network/companionResourceProviders';
import { exchangeCompanionSyncGroupMemberState } from '../shared/platform/companion/network/companionSyncGroupMemberState';
import { createSignedRequestHeaders } from '../shared/platform/companion/network/signedRequest';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { syncCompanionAttachmentResourceFromDesktop } from '../shared/platform/companionDesktopAttachmentResources';
import { pullMissingContentBlobs } from '../shared/platform/companionDesktopSyncContentBlobs';
import { postDesktopJson } from '../shared/platform/companionDesktopSyncHttp';
import { resolveReadableCompanionArticleByNodeId } from '../shared/platform/companionReadableArticle';
import { completeCompanionSyncGroupJoin, requestCompanionSyncGroupJoin } from '../shared/platform/companionSyncGroupJoinClient';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import { loadCompanionDiscoveryCandidates } from '../shared/platform/companionWorkspaceDiscovery';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { loadCompanionWorkspaceSyncState, saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { postResult } from './iosBridgeAcceptance';

const SCENARIO = 'resource-provider-failover';
const GROUP_ID = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_GROUP_ID;
const MAC_ID = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_MAC_ID;
const A5_ID = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_A5_ID;
const NODE_ID = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_NODE_ID;
const IMAGE_HASH = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_IMAGE_HASH;
const TRANSFER_404 = import.meta.env.VITE_FOLIOLE_ACCEPTANCE_TRANSFER_404 === '1';
const PACK_PATH = '/companion/sync-pack?after_state_seq=0';

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
  const pending = await requestCompanionSyncGroupJoin({ databasePath,
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

async function verifyRead() {
  const workspace = await loadCompanionWorkspaceSyncState();
  const article = resolveReadableCompanionArticleByNodeId(workspace.workspace_snapshot, NODE_ID);
  const resource = await resolveRuntimeAttachmentResource(`asset://${IMAGE_HASH}.png`, { refresh: true });
  if (article?.bodyStatus !== 'ready' || !article.content.includes('Resource LAN body remains readable.') ||
      !article.content.includes(`asset://${IMAGE_HASH}.png`) || resource?.status !== 'ready') {
    throw new Error('acceptance_article_or_attachment_unreadable');
  }
  return { article_body_status: article.bodyStatus, attachment_status: resource.status,
    resource_url: resource.resource_url };
}

export async function runIosResourceProviderFailoverAcceptance() {
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
      postResult({ error: null, evidence: await verifyRead(), phase: 'restart-clean',
        scenario: SCENARIO, status: 'passed' });
      return;
    }
    await joinMac(discovered, bootstrap.database_path);
    await saveCompanionWorkspaceSyncEndpoint(discovered.endpointUrl);
    await exchangeCompanionSyncGroupMemberState({ deviceId: MAC_ID, endpointUrl: discovered.endpointUrl,
      groupId: GROUP_ID });
    await applyCompanionDesktopSyncPack({
      headers: await createSignedRequestHeaders({ endpointUrl: discovered.endpointUrl,
        method: 'GET', pathWithQuery: PACK_PATH }),
      sourceHostName: discovered.discovery.provider_device_name, sourcePeerId: MAC_ID,
      url: `${discovered.endpointUrl}${PACK_PATH}`
    });
    await pullMissingContentBlobs(discovered.endpointUrl);
    const providers = await loadBothProviders(discovered.endpointUrl);
    const claims = await Promise.all(providers.filter((provider) =>
      !TRANSFER_404 || provider.deviceId === A5_ID).map(async (provider) => {
      await exchangeCompanionSyncGroupMemberState(provider);
      const reply = await postDesktopJson<ResourceAvailabilityReply>(provider.endpointUrl,
        RESOURCE_AVAILABILITY_PATH, { resources: [{ kind: 'attachment', id: IMAGE_HASH }] });
      return { device_id: provider.deviceId, endpoint: provider.endpointUrl,
        claim: reply.resources[0]?.status, reply_device_id: reply.provider_device_id };
    }));
    if (claims.some((claim) => claim.device_id !== claim.reply_device_id) ||
        (!TRANSFER_404 && claims.find((claim) => claim.device_id === MAC_ID)?.claim !== 'missing') ||
        claims.find((claim) => claim.device_id === A5_ID)?.claim !== 'available') {
      throw new Error(`acceptance_provider_claims_invalid_${JSON.stringify(claims)}`);
    }
    const transferAttempts: { deviceId: string; endpointUrl: string;
      errors: Record<string, string>; ready: string[] }[] = [];
    const transfer = await syncCompanionAttachmentResourceFromDesktop(discovered.endpointUrl,
      IMAGE_HASH, (attempt) => transferAttempts.push(attempt));
    if (transfer.status !== 'cached') throw new Error(`acceptance_transfer_${transfer.status}`);
    if (TRANSFER_404 && (transferAttempts[0]?.deviceId !== MAC_ID ||
        transferAttempts[0]?.errors[`attachment:${IMAGE_HASH}`] !== 'missing_file' ||
        transferAttempts[1]?.deviceId !== A5_ID ||
        !transferAttempts[1]?.ready.includes(`attachment:${IMAGE_HASH}`))) {
      throw new Error(`acceptance_transfer_order_invalid_${JSON.stringify(transferAttempts)}`);
    }
    postResult({ claims, error: null, evidence: await verifyRead(), phase: 'provider-selected',
      scenario: SCENARIO, status: 'passed', transfer, transfer_attempts: transferAttempts });
  } catch (error) {
    postResult({ error: error instanceof Error ? error.message : String(error),
      phase: 'failed', scenario: SCENARIO, status: 'failed' });
  }
}
