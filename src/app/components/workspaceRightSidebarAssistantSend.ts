import type {
  NativeAssistantThreadIndexRecord,
  NativeAssistantWorkspaceContext
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { sendAssistantMessage } from '../../shared/platform/assistantRuntime';

import type { WorkspaceLayoutDocumentProps } from './workspaceLayoutPropGroups';
import {
  resolveAssistantLocation,
  resolveAssistantTurnWorkspaceContext
} from './workspaceRightSidebarAssistantPanelModel';

export async function sendAssistantTurn(args: AssistantSendTurnArgs, clientTurnId: string, message: string) {
  const openingLocation = args.selectedRecord?.location ?? args.location;
  return sendAssistantMessage({
    clientTurnId,
    message,
    openingLocation,
    workspaceContext: resolveAssistantTurnWorkspaceContext({
      activeNodeId: args.activeNodeId,
      editorAdapter: args.editorAdapterRef?.current ?? null,
      location: args.location,
      nodesById: args.nodesById,
      selectedRecord: args.selectedRecord,
      workspaceContextOverride: args.workspaceContextOverride
    }),
    ...(args.selectedThreadId ? { providerThreadId: args.selectedThreadId } : {})
  });
}

export type AssistantSendTurnArgs = {
  activeNodeId: string | null;
  editorAdapterRef: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  location: ReturnType<typeof resolveAssistantLocation>;
  nodesById: Record<string, Node>;
  selectedRecord: NativeAssistantThreadIndexRecord | null;
  selectedThreadId: string | null;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
};
