import { vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
export function createCompanionArticleSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'article-1',
    nodeOrder: ['folder-1', 'article-1', 'article-2'],
    nodesById: {
      'folder-1': createSnapshotNode('folder-1', 'folder', 'Reading', null, ''),
      'article-1': createSnapshotNode('article-1', 'topic', 'First article', 'folder-1', '# First article\n\nBody'),
      'article-2': createSnapshotNode('article-2', 'topic', 'Second article', 'folder-1', '# Second article\n\nNext')
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function createSnapshotNode(
  id: string,
  kind: 'folder' | 'topic',
  title: string,
  parentNodeId: string | null,
  content: string
) {
  return {
    anchorLink: null,
    content,
    createdAt: id === 'article-2' ? '2026-04-22T08:02:00.000Z' : '2026-04-22T08:01:00.000Z',
    hideTitleHeading: false,
    id,
    isTitleManual: false,
    kind,
    parentNodeId,
    reading: null,
    reveal: null,
    review: null,
    title,
    updatedAt: id === 'article-2' ? '2026-04-22T08:02:00.000Z' : '2026-04-22T08:01:00.000Z'
  };
}

export function createWorkspaceSync(snapshot: WorkspaceSnapshot | null = createCompanionArticleSnapshot()) {
  const state = createSyncState(snapshot);
  return {
    bootstrapState: {
      booted_at: '2026-04-22T08:03:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor' as const
    },
    checkDesktop: vi.fn(),
    clearError: vi.fn(),
    completePairing: vi.fn(),
    cancelPairing: vi.fn(),
    disconnectPairing: vi.fn(),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    error: null,
    isWorkspaceSyncStateReady: true,
    pendingPairRequest: null,
    pairingState: createPairingState(true),
    pairingStatus: 'idle' as const,
    pullFromDesktop: vi.fn(async () => createSyncState(snapshot)),
    readableArticle: createReadableArticle(),
    replaceSnapshot: vi.fn(async () => state),
    refreshFromDevice: vi.fn(async () => state),
    refreshPairingState: vi.fn(async () => createPairingState(true)),
    removeRememberedTarget: vi.fn(),
    requestPairing: vi.fn(),
    saveSyncOnboardingStatus: vi.fn(async () => state),
    saveEndpoint: vi.fn(),
    state,
    syncConflictCount: 0,
    syncParticipation: {
      lifecycle_active: true, participating: true, sync_enabled: true, sync_paused: false
    },
    syncProgress: null,
    status: 'idle' as const
  };
}

function createSyncState(snapshot: WorkspaceSnapshot | null) {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-22T08:03:00.000Z',
    remembered_targets: ['http://10.0.2.2:38641'],
    sync_events: [],
    sync_onboarding_status: 'completed' as const,
    workspace_snapshot: snapshot
  };
}

function createPairingState(isPaired: boolean) {
  return {
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Android companion',
    is_paired: isPaired,
    paired_at: isPaired ? '2026-04-22T08:03:00.000Z' : null
  };
}

function createReadableArticle() {
  return {
    content: '# First article\n\nBody',
    hideTitleHeading: false,
    nodeId: 'article-1',
    persistedNodeViewState: null,
    pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: 'First article'
  };
}

export function createUnpairedWorkspaceSync() {
  return {
    ...createWorkspaceSync(null),
    pairingState: createPairingState(false),
    readableArticle: null,
    state: {
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'pending' as const,
      workspace_snapshot: null
    }
  };
}

export function createFloatingBar() {
  return {
    handleContainerScroll: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchStart: vi.fn(),
    isVisible: true,
    revealBar: vi.fn()
  };
}
