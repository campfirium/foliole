import type {
  NativeAssistantThreadIndexRecord,
  NativeAssistantModelSelection
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
  const openingId = args.openingLocation.type === 'node' ? [args.openingLocation.nodeId] : [];
  const materialIds = [...new Set([...openingId, ...(args.savedMaterialIds ?? args.linkedMaterialIds ?? [])])];
  const materials = materialIds.flatMap(nodeId => {
    const node = args.nodesById[nodeId];
    return node && node.kind !== 'folder' && !node.specialKind && !args.trashedNodeIds?.includes(nodeId)
      ? [{ nodeId, title: node.title }] : [];
  });
  const workspaceContext = resolveAssistantTurnReferenceContext({
    followCurrentMaterial: materials.some(material => material.nodeId === args.activeNodeId),
    location: args.location,
    nodesById: args.nodesById
  });
  if (materials.length) workspaceContext.conversationMaterials = materials;
  return sendAssistantMessage({
    clientTurnId,
    ...(images.length ? { images } : {}),
    message,
    ...(args.linkedMaterialIds?.length ? { linkedMaterialIds: args.linkedMaterialIds } : {}),
    ...(args.provider === 'codex-app-server' && args.modelSelection
      ? { modelSelection: args.modelSelection }
      : {}),
    openingLocation: args.openingLocation,
    provider: args.provider,
    workspaceContext,
    ...(args.selectedThreadId ? { providerThreadId: args.selectedThreadId } : {})
  });
}

export type AssistantSendTurnArgs = {
  activeNodeId: string | null;
  editorAdapterRef: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  savedMaterialIds?: string[] | undefined;
  trashedNodeIds?: readonly string[] | undefined;
  linkedMaterialIds?: string[];
  location: ReturnType<typeof resolveAssistantLocation>;
  modelSelection?: NativeAssistantModelSelection;
  provider: import('../../../lib/platform/nativeAssistantContract').NativeAssistantProviderId;
  nodesById: Record<string, Node>;
  openingLocation: NativeAssistantThreadIndexRecord['location'];
  selectedThreadId: string | null;
};
