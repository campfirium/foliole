import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

export function createNode(id: string, kind: Node['kind'], createdAt: string): Node {
  return {
    content: '',
    createdAt,
    id,
    kind,
    parentNodeId: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: createdAt
  };
}

export const reviewGateLayoutArgs = {
  activeNodeId: null,
  canGoBack: false,
  canGoForward: false,
  canGoParent: false,
  canStartStudyMode: true,
  contextMenu: null,
  editorAdapterRef: { current: null },
  editorCtx: {},
  editorNodeId: null,
  editorNodeViewState: null,
  isExternalViewOpen: false,
  isImmersiveMode: false,
  isImportManagementOpen: false,
  isListCollapsed: false,
  isPriorityQuickSetActive: false,
  isResizingList: false,
  isResizingRightSidebar: false,
  isReviewEditing: false,
  isRightSidebarCollapsed: false,
  isSettingsOpen: false,
  isStudyMode: false,
  isTrashViewOpen: false,
  isViewingTrashNode: false,
  isVirtualViewOpen: false,
  isWorkspaceHydrated: true,
  listWidth: 320,
  nav: {},
  nodeOrder: ['review-1'],
  nodesById: {
    'review-1': {
      ...createNode('review-1', 'item', '2026-03-03T12:00:00.000Z'),
      review: { due: '2026-03-03T00:00:00.000Z' } as never
    }
  },
  nowIso: '2026-03-03T12:00:00.000Z',
  requestedSettingsCategory: null,
  requestedSettingsDialog: null,
  reviewPreview: null,
  reviewSession: {
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: ['review-1'],
    totalNodeCount: 1
  },
  reviewSessionMode: 'recommended',
  reviewSettings: {
    isReviewSchedulerSettingsReady: false,
    reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
  },
  rightSidebarWidth: 320,
  selectedTrashNodeId: null,
  showAnswerSection: false,
  trashedNodeIds: []
} as const;
