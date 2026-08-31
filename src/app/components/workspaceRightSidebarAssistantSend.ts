import type {
  NativeAssistantThreadIndexRecord,
  NativeAssistantModelSelection,
  NativeAssistantWorkspaceContext
} from '../../../lib/platform/nativeAssistantContract';
import type { NativeAssistantImageDraft } from '../../../lib/platform/nativeAssistantImageContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { sendAssistantMessage } from '../../shared/platform/assistantRuntime';

import type { WorkspaceLayoutDocumentProps } from './workspaceLayoutPropGroups';
import {
  resolveAssistantLocation
} from './workspaceRightSidebarAssistantPanelModel';
import { resolveAssistantTurnReferenceContext } from './workspaceRightSidebarAssistantReferenceContext';

export async function sendAssistantTurn(
  args: AssistantSendTurnArgs,
  clientTurnId: string,
  message: string,
  images: NativeAssistantImageDraft[] = []
) {
  const openingLocation = args.selectedRecord?.location ?? args.location;
  const workspaceContext = resolveAssistantTurnReferenceContext({
    followCurrentMaterial: args.followCurrentMaterial,
    location: args.location,
    nodesById: args.nodesById,
    workspaceContextOverride: args.workspaceContextOverride
  });
  return sendAssistantMessage({
    clientTurnId,
    ...(images.length ? { images } : {}),
    message,
    ...(args.provider === 'codex-app-server' && args.modelSelection
      ? { modelSelection: args.modelSelection }
      : {}),
    openingLocation,
    provider: args.provider,
    workspaceContext,
    ...(args.selectedThreadId ? { providerThreadId: args.selectedThreadId } : {})
  });
}

export type AssistantSendTurnArgs = {
  activeNodeId: string | null;
  editorAdapterRef: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  followCurrentMaterial: boolean;
  location: ReturnType<typeof resolveAssistantLocation>;
  modelSelection?: NativeAssistantModelSelection;
  provider: import('../../../lib/platform/nativeAssistantContract').NativeAssistantProviderId;
  nodesById: Record<string, Node>;
  selectedRecord: NativeAssistantThreadIndexRecord | null;
  selectedThreadId: string | null;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
};
