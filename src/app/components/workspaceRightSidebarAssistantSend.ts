import type {
  NativeAssistantThreadIndexRecord,
  NativeAssistantModelSelection,
  NativeAssistantWorkspaceSelectionContext
} from '../../../lib/platform/nativeAssistantContract';
import type { NativeAssistantImageDraft } from '../../../lib/platform/nativeAssistantImageContract';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
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
  const selection = workspaceContext.activeNodeId === args.activeNodeId
    ? readEditorSelectionContext(args.editorAdapterRef?.current ?? null)
    : null;
  if (selection) workspaceContext.selection = selection;
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

const MAX_SELECTION_CHARS = 1200;

// Only the selected text is sent; the main process assembles the rest of the attached context.
export function readEditorSelectionContext(
  adapter: Pick<EditorAdapter, 'getContent' | 'getSelection'> | null
): NativeAssistantWorkspaceSelectionContext | null {
  if (!adapter) return null;
  const { from, to } = adapter.getSelection();
  if (to <= from) return null;
  const text = adapter.getContent().slice(from, to);
  if (!text.trim()) return null;
  return {
    charCount: text.length,
    ranges: [{ from, to }],
    text: text.slice(0, MAX_SELECTION_CHARS),
    truncated: text.length > MAX_SELECTION_CHARS
  };
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
