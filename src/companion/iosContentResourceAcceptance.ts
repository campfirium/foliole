import { resolveRuntimeAttachmentResource } from '../shared/platform/attachmentResources';
import { createSignedRequestHeaders } from '../shared/platform/companion/network/signedRequest';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { pullMissingContentBlobs } from '../shared/platform/companionDesktopSyncContentBlobs';
import { pullMissingAttachmentResources } from '../shared/platform/companionDesktopSyncResources';
import { loadCompanionExternalDocument } from '../shared/platform/companionExternalDocuments';
import { searchCompanionFullText } from '../shared/platform/companionFullTextSearch';
import { resolveReadableCompanionArticleByNodeId } from '../shared/platform/companionReadableArticle';
import { loadCompanionPdfPageText } from '../shared/platform/companionSyncObjects';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import { loadCompanionWorkspaceSyncState, saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { ensureIosAcceptanceSyncGroup, loadIosAcceptanceSyncPeer } from './iosAcceptanceSyncGroup';
import { acceptanceEndpoint, postResult } from './iosBridgeAcceptance';

const PACK_PATH = '/acceptance/sync-pack/content-resource';
const IDS = {
  corrupt: 'ios-acceptance-corrupt-attachment',
  external: 'ios-external:orchid.md',
  failed: 'ios-acceptance-failed-attachment',
  missing: 'ios-acceptance-missing-attachment',
  topic: 'ios-content-topic',
  valid: 'ios-acceptance-valid-attachment'
} as const;
const TOKENS = {
  external: 'external-orchid-token',
  pdf: 'pdf-cobalt-token',
  topic: 'topic-amber-token'
} as const;

async function prepareGroup(endpoint: string, databasePath: string | null) {
  await ensureIosAcceptanceSyncGroup(endpoint, databasePath);
  await saveCompanionWorkspaceSyncEndpoint(endpoint);
}

async function applyStructure(endpoint: string) {
  const peer = await loadIosAcceptanceSyncPeer();
  await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ endpointUrl: endpoint, method: 'GET', pathWithQuery: PACK_PATH }),
    ...peer,
    url: `${endpoint}${PACK_PATH}`
  });
}

async function loadReadEvidence() {
  const workspace = await loadCompanionWorkspaceSyncState();
  const topic = resolveReadableCompanionArticleByNodeId(workspace.workspace_snapshot, IDS.topic);
  const corruptBody = resolveReadableCompanionArticleByNodeId(workspace.workspace_snapshot, 'ios-content-corrupt');
  const missingBody = resolveReadableCompanionArticleByNodeId(workspace.workspace_snapshot, 'ios-content-missing');
  const [pdfPages, external, topicSearch, pdfSearch, externalSearch, valid, corrupt, failed, missing] = await Promise.all([
    loadCompanionPdfPageText(IDS.valid),
    loadCompanionExternalDocument(IDS.external),
    searchCompanionFullText(TOKENS.topic),
    searchCompanionFullText(TOKENS.pdf),
    searchCompanionFullText(TOKENS.external),
    resolveRuntimeAttachmentResource(`asset://${IDS.valid}.pdf`),
    resolveRuntimeAttachmentResource(`asset://${IDS.corrupt}.png`),
    resolveRuntimeAttachmentResource(`asset://${IDS.failed}.png`),
    resolveRuntimeAttachmentResource(`asset://${IDS.missing}.png`)
  ]);
  if (valid?.status !== 'ready') throw new Error('The valid acceptance attachment was not readable.');
  return {
    body_failures: { corrupt: corruptBody?.bodyStatus, missing: missingBody?.bodyStatus },
    external: { body_status: external?.bodyStatus, content: external?.content, document_id: external?.document_id },
    pdf: { pages: pdfPages, search_matches: pdfSearch.pdf.map((row) => row.attachment_id) },
    resources: {
      corrupt: corrupt?.status,
      failed: failed?.status,
      missing: missing?.status,
      valid: { mime_type: valid?.mime_type, resource_url: valid?.resource_url, status: valid?.status }
    },
    searches: {
      external: externalSearch.external.map((row) => row.document_id),
      topic: topicSearch.topics.map((row) => row.nodeId)
    },
    topic: { body_status: topic?.bodyStatus, content: topic?.content, node_id: topic?.nodeId }
  };
}

export async function runIosContentResourceAcceptance() {
  try {
    const endpoint = acceptanceEndpoint();
    if (!endpoint) throw new Error('iOS content resource acceptance endpoint is unavailable.');
    const bootstrap = await loadCompanionBootstrapState();
    const group = await loadCompanionSyncGroup();
    let resourceSync = null;
    if (!group) {
      await prepareGroup(endpoint, bootstrap.database_path);
      await applyStructure(endpoint);
      resourceSync = {
        content: await pullMissingContentBlobs(endpoint),
        attachments: await pullMissingAttachmentResources(endpoint)
      };
    }
    postResult({
      error: null,
      evidence: await loadReadEvidence(),
      phase: group ? 'resources-restored' : 'resources-synced',
      resource_sync: resourceSync,
      scenario: 'content-resource-read',
      status: 'passed'
    });
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'content-resource-read',
      status: 'failed'
    });
  }
}
