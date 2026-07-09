import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';

import type { WorkspaceDebugOperationHistory } from './workspaceDebugHistory';
import type { SeedNodeDebugApi } from './workspaceDebugSeedApi';

export interface WorkspaceDebugApi {
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
    anchorKind: 'highlight' | 'cloze' | null;
    anchorLink: NodeAnchorLink | null;
    content: string;
    id: string;
    kind: string;
    parentNodeId: string | null;
    reading: { nextAt: string; state: string } | null;
    reveal: string | null;
    review: { due: string; state: number } | null;
    shelvedAt: string | null;
    title: string;
    trashed: boolean;
  } | null;
  getNodeViewState: (nodeId: string) => { scrollTop: number; selection: { from: number; to: number } | null } | null;
  getReviewSession: () => {
    currentNodeId: string | null;
    queueNodeIds: string[];
    soonNodeIds?: string[];
  };
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
  updateNodeContent: (nodeId: string, content: string) => Promise<boolean>;
  upsertTopicForDebug: (args: { content: string; id: string; title: string }) => boolean;
}

export type WorkspaceDebugWindow = Window & {
  electronAPI?: { debug?: { workspaceDebugBridge?: boolean; workspaceDebugSeedPersistence?: boolean } };
  __folioleWorkspaceDebug?: WorkspaceDebugApi;
};
