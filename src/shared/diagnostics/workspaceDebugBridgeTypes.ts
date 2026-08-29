import type {
  NodeAnchorLink,
  NodeReadingProfile,
  NodeReviewProfile
} from '../../features/nodes/model/nodeTypes';
import type { ReviewSessionState } from '../../store/workspaceStore';

import type { WorkspaceDebugOperationHistory } from './workspaceDebugHistory';
import type { SeedNodeDebugApi } from './workspaceDebugSeedApi';

export interface WorkspaceDebugApi {
  createRootNode: (content?: string, kind?: 'folder' | 'topic') => Promise<string | null>;
  createTextClozeChild: (args: {
    anchorId: string;
    anchorLink?: NodeAnchorLink | null;
    answer: string;
    parentNodeId: string;
    prompt: string;
  }) => Promise<string | null>;
  createTextHighlightChild: (args: {
    anchorId: string;
    anchorLink?: NodeAnchorLink | null;
    parentNodeId: string;
    text: string;
  }) => Promise<string | null>;
  deleteNode: (nodeId: string) => Promise<boolean>;
  deleteNodePermanently: (nodeId: string) => Promise<boolean>;
  getActiveNodeId: () => string | null;
  getEditorOperationHistory: () => WorkspaceDebugOperationHistory;
  getNode: (nodeId: string) => {
    anchorKind: 'highlight' | 'cloze' | 'image-excerpt' | null;
    anchorLink: NodeAnchorLink | null;
    content: string;
    id: string;
    kind: string;
    parentNodeId: string | null;
    reading: NodeReadingProfile | null;
    reveal: string | null;
    review: NodeReviewProfile | null;
    shelvedAt: string | null;
    title: string;
    trashed: boolean;
  } | null;
  getNodeViewState: (nodeId: string) => { scrollTop: number; selection: { from: number; to: number } | null } | null;
  getReviewSession: () => ReviewSessionState;
  getWorkspaceStructureHistory: () => {
    pendingCreate: { id: string; type: string } | null;
    redoStack: Array<{ id: string; type: string }>;
    undoStack: Array<{ id: string; type: string }>;
  };
  getWorkspaceStructureState: () => { nodeOrder: string[] };
  importClipboardImageAttachment: (args: {
    bytesBase64: string;
    mimeType: string;
    nodeId: string;
    originalName?: string;
  }) => Promise<string | null>;
  isHydrated: () => boolean;
  completeReviewSessionForDebug: (args: { completedAt: string; continueNodeId: string; sessionStartedAt: string }) => void;
  listNodes: () => Array<{ id: string; title: string }>;
  openNode: (nodeId: string) => Promise<boolean>;
  restoreNode: (nodeId: string) => Promise<boolean>;
  seedNodes: SeedNodeDebugApi['seedNodes'];
  setNodeViewState: (args: { from: number; nodeId: string; scrollTop?: number; to: number }) => boolean;
  shelveNode: (nodeId: string, now?: string) => boolean;
  unshelveNode: (nodeId: string, now?: string) => boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => Promise<boolean>;
  updateNodeTitle: (nodeId: string, title: string) => Promise<boolean>;
  updateNodeContent: (nodeId: string, content: string) => Promise<boolean>;
  upsertTopicForDebug: (args: { content: string; id: string; title: string }) => boolean;
}

export type WorkspaceDebugWindow = Window & {
  electronAPI?: { debug?: { workspaceDebugBridge?: boolean; workspaceDebugSeedPersistence?: boolean } };
  __folioleWorkspaceDebug?: WorkspaceDebugApi;
};
