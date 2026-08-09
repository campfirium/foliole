// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(), clearPairing: vi.fn(), loadBootstrap: vi.fn(), loadExternal: vi.fn(), loadPairing: vi.fn(),
  loadPdf: vi.fn(), loadWorkspace: vi.fn(), pair: vi.fn(), postResult: vi.fn(), pullAttachments: vi.fn(),
  pullContent: vi.fn(), requestPairing: vi.fn(), resolveArticle: vi.fn(), resolveResource: vi.fn(),
  saveEndpoint: vi.fn(), search: vi.fn(), sign: vi.fn()
}));

vi.mock('../shared/platform/attachmentResources', () => ({ resolveRuntimeAttachmentResource: mocks.resolveResource }));
vi.mock('../shared/platform/companionDesktopSyncResources', () => ({ pullMissingAttachmentResources: mocks.pullAttachments }));
vi.mock('../shared/platform/companionDesktopSyncContentBlobs', () => ({ pullMissingContentBlobs: mocks.pullContent }));
vi.mock('../shared/platform/companionExternalDocuments', () => ({ loadCompanionExternalDocument: mocks.loadExternal }));
vi.mock('../shared/platform/companionFullTextSearch', () => ({ searchCompanionFullText: mocks.search }));
vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.loadBootstrap }));
vi.mock('../shared/platform/companionSyncObjects', () => ({ loadCompanionPdfPageText: mocks.loadPdf }));
vi.mock('../shared/platform/companionSyncPackApply', () => ({ applyCompanionDesktopSyncPack: mocks.apply }));
vi.mock('../shared/platform/companionWorkspacePairing', () => ({
  clearCompanionPairingCredentials: mocks.clearPairing,
  createSignedRequestHeaders: mocks.sign,
  loadCompanionPairingState: mocks.loadPairing,
  pairCompanionWithDesktop: mocks.pair,
  requestCompanionPairing: mocks.requestPairing
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionWorkspaceSyncState: mocks.loadWorkspace,
  saveCompanionWorkspaceSyncEndpoint: mocks.saveEndpoint
}));
vi.mock('../shared/platform/companionReadableArticle', () => ({ resolveReadableCompanionArticleByNodeId: mocks.resolveArticle }));
vi.mock('./iosBridgeAcceptance', () => ({
  acceptanceEndpoint: () => 'http://127.0.0.1:43123', postResult: mocks.postResult
}));

import { runIosContentResourceAcceptance } from './iosContentResourceAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadBootstrap.mockResolvedValue({ device_id: 'ios-1', device_name: 'Acceptance iPhone' });
  mocks.requestPairing.mockResolvedValue({ pair_request_id: 'pair-1' });
  mocks.loadPairing.mockResolvedValue({ remote_peer_id: 'desktop-1' });
  mocks.sign.mockResolvedValue({ 'X-Signature': 'signed' });
  mocks.pullContent.mockResolvedValue({ syncedContentBlobHashes: ['topic', 'external'] });
  mocks.pullAttachments.mockResolvedValue({ syncedAttachmentIds: ['ios-acceptance-valid-attachment'] });
  mocks.loadWorkspace.mockResolvedValue({ workspace_snapshot: { nodesById: {} } });
  mocks.resolveArticle.mockImplementation((_snapshot: unknown, nodeId: string) => nodeId === 'ios-content-topic'
    ? { bodyStatus: 'ready', content: 'topic-amber-token', nodeId }
    : { bodyStatus: 'failed', content: '', nodeId });
  mocks.loadPdf.mockResolvedValue([{ attachment_id: 'ios-acceptance-valid-attachment', page: 1, text: 'pdf-cobalt-token' }]);
  mocks.loadExternal.mockResolvedValue({ bodyStatus: 'ready', content: 'external-orchid-token', document_id: 'ios-external:orchid.md' });
  mocks.search.mockImplementation(async (token: string) => ({
    external: token.includes('external') ? [{ document_id: 'ios-external:orchid.md' }] : [],
    pdf: token.includes('pdf') ? [{ attachment_id: 'ios-acceptance-valid-attachment' }] : [],
    topics: token.includes('topic') ? [{ nodeId: 'ios-content-topic' }] : []
  }));
  mocks.resolveResource.mockImplementation(async (url: string) => url.includes('valid')
    ? { mime_type: 'application/pdf', resource_url: 'capacitor://local.pdf', status: 'ready' }
    : { resource_url: null, status: 'missing_file' });
});

it('pairs, applies, downloads resources, and reads all three domains on the first launch', async () => {
  mocks.loadPairing.mockResolvedValue({ is_paired: false, remote_peer_id: 'desktop-1' });

  await runIosContentResourceAcceptance();

  expect(mocks.apply).toHaveBeenCalledWith({
    headers: { 'X-Signature': 'signed' },
    sourcePeerId: 'desktop-1',
    url: 'http://127.0.0.1:43123/acceptance/sync-pack/content-resource'
  });
  expect(mocks.pullContent).toHaveBeenCalledOnce();
  expect(mocks.pullAttachments).toHaveBeenCalledOnce();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    evidence: expect.objectContaining({
      body_failures: { corrupt: 'failed', missing: 'failed' },
      resources: expect.objectContaining({ valid: expect.objectContaining({ status: 'ready' }) })
    }),
    phase: 'resources-synced', scenario: 'content-resource-read', status: 'passed'
  }));
});

it('only reloads persisted reads and searches after restart', async () => {
  mocks.loadPairing.mockResolvedValue({ device_id: 'ios-1', is_paired: true, remote_peer_id: 'desktop-1' });

  await runIosContentResourceAcceptance();

  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.pullContent).not.toHaveBeenCalled();
  expect(mocks.pullAttachments).not.toHaveBeenCalled();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    phase: 'resources-restored', resource_sync: null, status: 'passed'
  }));
});

it('posts a structured failure without reporting partial success', async () => {
  mocks.loadPairing.mockRejectedValue(new Error('pairing unavailable'));
  await runIosContentResourceAcceptance();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    error: 'pairing unavailable', phase: 'failed', scenario: 'content-resource-read', status: 'failed'
  }));
});
