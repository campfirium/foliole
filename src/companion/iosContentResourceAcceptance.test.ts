// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sync: vi.fn(), ensureGroup: vi.fn(), loadBootstrap: vi.fn(), loadExternal: vi.fn(), loadGroup: vi.fn(),
  loadArticle: vi.fn(), loadPdf: vi.fn(), loadWorkspace: vi.fn(), postResult: vi.fn(),
  resolveResource: vi.fn(),
  saveEndpoint: vi.fn(), search: vi.fn()
}));

vi.mock('../shared/platform/attachmentResources', () => ({ resolveRuntimeAttachmentResource: mocks.resolveResource }));
vi.mock('../shared/platform/companionExternalDocuments', () => ({ loadCompanionExternalDocument: mocks.loadExternal }));
vi.mock('../shared/platform/companionFullTextSearch', () => ({ searchCompanionFullText: mocks.search }));
vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.loadBootstrap }));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({ loadCompanionSyncGroup: mocks.loadGroup }));
vi.mock('../shared/platform/companionSyncObjects', () => ({ loadCompanionPdfPageText: mocks.loadPdf }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionReadableArticle: mocks.loadArticle,
  loadCompanionWorkspaceSyncState: mocks.loadWorkspace,
  saveCompanionWorkspaceSyncEndpoint: mocks.saveEndpoint
}));
vi.mock('./iosAcceptanceRequestSync', () => ({ syncIosAcceptanceRequest: mocks.sync }));
vi.mock('./iosBridgeAcceptance', () => ({ postResult: mocks.postResult }));
vi.mock('./iosAcceptanceSyncGroup', () => ({
  ensureIosAcceptanceSyncGroup: mocks.ensureGroup
}));

import { runIosContentResourceAcceptance } from './iosContentResourceAcceptance';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadBootstrap.mockResolvedValue({ database_path: '/app/foliole.db' });
  mocks.loadGroup.mockResolvedValue(null);
  mocks.ensureGroup.mockResolvedValue({ endpointUrl: 'http://127.0.0.1:43123',
    group: { group_id: 'group-1' }, joined: true,
    peer: { sourceHostName: 'Acceptance Desktop', sourcePeerId: 'desktop-1' } });
  mocks.sync.mockResolvedValue({ remainingAttachmentResourceCount: 3 });
  mocks.loadWorkspace.mockResolvedValue({ workspace_snapshot: { nodesById: {} } });
  mocks.loadArticle.mockImplementation((_snapshot: unknown, nodeId: string) => nodeId === 'ios-content-topic'
    ? { bodyStatus: 'ready', content: 'topic-amber-token', nodeId }
    : { bodyStatus: 'ready', nodeId, content: nodeId === 'ios-content-corrupt'
      ? '# Corrupt\n\nexpected corrupt body' : '# Missing\n\nexpected missing body' });
  mocks.loadPdf.mockResolvedValue([{ attachment_id: '7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d', page: 1, text: 'pdf-cobalt-token' }]);
  mocks.loadExternal.mockResolvedValue({ bodyStatus: 'ready', content: 'external-orchid-token', document_id: 'ios-external:orchid.md' });
  mocks.search.mockImplementation(async (token: string) => ({
    external: token.includes('external') ? [{ document_id: 'ios-external:orchid.md' }] : [],
    pdf: token.includes('pdf') ? [{ attachment_id: '7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d' }] : [],
    topics: token.includes('topic') ? [{ nodeId: 'ios-content-topic' }] : []
  }));
  mocks.resolveResource.mockImplementation(async (url: string) => url.endsWith('.pdf')
    ? { mime_type: 'application/pdf', resource_url: 'capacitor://local.pdf', status: 'ready' }
    : { resource_url: null, status: 'missing_file' });
});

it('joins, applies, downloads resources, and reads all three domains on the first launch', async () => {
  await runIosContentResourceAcceptance();

  expect(mocks.loadBootstrap.mock.invocationCallOrder[0] ?? Infinity)
    .toBeLessThan(mocks.loadGroup.mock.invocationCallOrder[0] ?? -Infinity);
  expect(mocks.sync).toHaveBeenCalledOnce();
  expect(mocks.sync).toHaveBeenCalledWith('http://127.0.0.1:43123', {
    sourceHostName: 'Acceptance Desktop', sourcePeerId: 'desktop-1'
  });
  expect(mocks.loadArticle).toHaveBeenCalledWith({ nodesById: {} }, 'ios-content-topic');
  expect(mocks.resolveResource).toHaveBeenCalledTimes(4);
  expect(mocks.resolveResource.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
    expect.stringMatching(/^asset:\/\/[a-f0-9]{64}\.pdf$/u),
    expect.stringMatching(/^asset:\/\/[a-f0-9]{64}\.png$/u)
  ]));
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    evidence: expect.objectContaining({
      bodies: {
        corrupt: { body_status: 'ready', content: '# Corrupt\n\nexpected corrupt body' },
        missing: { body_status: 'ready', content: '# Missing\n\nexpected missing body' }
      },
      topic: { body_status: 'ready', content: 'topic-amber-token', node_id: 'ios-content-topic' },
      resources: expect.objectContaining({ valid: expect.objectContaining({ status: 'ready' }) })
    }),
    phase: 'resources-synced', scenario: 'content-resource-read', status: 'passed'
  }));
});

it('only reloads persisted reads and searches after restart', async () => {
  mocks.loadGroup.mockResolvedValue({ group_id: 'group-1' });

  await runIosContentResourceAcceptance();

  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    phase: 'resources-restored', resource_sync: null, status: 'passed'
  }));
});

it('posts a structured failure without reporting partial success', async () => {
  mocks.ensureGroup.mockRejectedValue(new Error('join unavailable'));
  await runIosContentResourceAcceptance();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    error: 'join unavailable', phase: 'failed', scenario: 'content-resource-read', status: 'failed'
  }));
});


it.each(['corrupt', 'missing'])('rejects an incomplete %s body instead of passing a partial structure', async name => {
  const original = mocks.loadArticle.getMockImplementation()!;
  mocks.loadArticle.mockImplementation((workspace, nodeId) => nodeId === `ios-content-${name}`
    ? { nodeId, bodyStatus: 'ready', content: 'truncated' } : original(workspace, nodeId));
  await runIosContentResourceAcceptance();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    error: 'The acceptance bodies were not preserved completely.', status: 'failed'
  }));
});
