import { resolveRuntimeAttachmentResource } from '../shared/platform/attachmentResources';
import { createSignedRequestHeaders } from '../shared/platform/companion/network/signedRequest';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { syncCompanionAttachmentResourceRequestsFromDesktop } from '../shared/platform/companionDesktopAttachmentResources';
import { pullMissingContentBlobs } from '../shared/platform/companionDesktopSyncContentBlobs';
import { loadCompanionExternalDocument } from '../shared/platform/companionExternalDocuments';
import { searchCompanionFullText } from '../shared/platform/companionFullTextSearch';
import { loadCompanionPdfPageText } from '../shared/platform/companionSyncObjects';
import { applyCompanionDesktopSyncPack } from '../shared/platform/companionSyncPackApply';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import { ensureIosAcceptanceSyncGroup } from './iosAcceptanceSyncGroup';
import { postResult } from './iosBridgeAcceptance';

const PACK_PATH = '/acceptance/sync-pack/content-resource';
const IDS = {
  corrupt: '5703850972e2da20d5cd065cbb73c20c5d18778148a664b1238ce99120b1d301',
  external: 'ios-external:orchid.md',
  failed: 'e4bd1f4f95e08bac38c59af1b1ef34aeb05e77d1e54492c14c12b1ac570e2318',
  missing: '654aa8b756a2aa8b8acc8db2d4cee7746dd98a07ca7f2f2d5f19c1777bc37e2d',
  topic: 'ios-content-topic',
  valid: '7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d'
} as const;
const TOKENS = {
  external: 'external-orchid-token',
  pdf: 'pdf-cobalt-token',
  topic: 'topic-amber-token'
} as const;
const RESOURCE_KEYS = {
  corrupt: '5703850972e2da20d5cd065cbb73c20c5d18778148a664b1238ce99120b1d301.png',
  failed: 'e4bd1f4f95e08bac38c59af1b1ef34aeb05e77d1e54492c14c12b1ac570e2318.png',
  missing: '654aa8b756a2aa8b8acc8db2d4cee7746dd98a07ca7f2f2d5f19c1777bc37e2d.png',
  valid: '7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d.pdf'
} as const;

async function applyStructure(endpoint: string, peer: { sourceHostName: string; sourcePeerId: string }) {
  await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ endpointUrl: endpoint, method: 'GET', pathWithQuery: PACK_PATH }),
    ...peer,
    url: `${endpoint}${PACK_PATH}`
  });
}

async function loadReadEvidence() {
  const workspace = await loadCompanionWorkspaceSyncState();
  const [topic, corruptBody, missingBody, pdfPages, external, topicSearch, pdfSearch, externalSearch,
    valid, corrupt, failed, missing] = await Promise.all([
    loadCompanionReadableArticle(workspace.workspace_snapshot, IDS.topic),
    loadCompanionReadableArticle(workspace.workspace_snapshot, 'ios-content-corrupt'),
    loadCompanionReadableArticle(workspace.workspace_snapshot, 'ios-content-missing'),
    loadCompanionPdfPageText(IDS.valid),
    loadCompanionExternalDocument(IDS.external),
    searchCompanionFullText(TOKENS.topic),
    searchCompanionFullText(TOKENS.pdf),
    searchCompanionFullText(TOKENS.external),
    resolveRuntimeAttachmentResource(`asset://${RESOURCE_KEYS.valid}`),
    resolveRuntimeAttachmentResource(`asset://${RESOURCE_KEYS.corrupt}`),
    resolveRuntimeAttachmentResource(`asset://${RESOURCE_KEYS.failed}`),
    resolveRuntimeAttachmentResource(`asset://${RESOURCE_KEYS.missing}`)
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
    const bootstrap = await loadCompanionBootstrapState();
    const group = await loadCompanionSyncGroup();
    const joined = await ensureIosAcceptanceSyncGroup(bootstrap.database_path);
    const endpoint = joined.endpointUrl;
    let resourceSync = null;
    if (!group) {
      await saveCompanionWorkspaceSyncEndpoint(endpoint);
      await applyStructure(endpoint, joined.peer);
      resourceSync = {
        content: await pullMissingContentBlobs(endpoint),
        attachments: await syncCompanionAttachmentResourceRequestsFromDesktop(endpoint,
          (['corrupt', 'failed', 'missing', 'valid'] as const).map((key) => ({
            attachmentId: IDS[key], contentHash: IDS[key], storageKey: RESOURCE_KEYS[key],
            mimeType: key === 'valid' ? 'application/pdf' : 'image/png'
          })))
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
