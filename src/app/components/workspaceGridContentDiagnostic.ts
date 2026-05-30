import type { WorkspaceGridContentSource } from './WorkspaceGridContent';
import {
  startWorkspaceDiagnostic,
  useWorkspaceFrameDiagnostic,
  useWorkspaceRenderDiagnostic
} from './workspaceInputLagRenderDiagnostic';

export function useWorkspaceGridContentDiagnostic(args: {
  documentNodeId: string | null;
  props: WorkspaceGridContentSource;
}) {
  const { documentNodeId, props } = args;
  const details = {
    activeNodeId: props.navigation.activeNodeId,
    documentNodeId,
    editorContentLength: props.document.editorContent?.length ?? 0
  };
  const finishDiagnostic = startWorkspaceDiagnostic('workspace-grid-content-total', details);
  useWorkspaceRenderDiagnostic('workspace-grid-content-render', {
    ...details,
    nodesById: props.nodeList.nodesById,
    nodeOrder: props.nodeList.nodeOrder
  });
  useWorkspaceFrameDiagnostic('workspace-grid-content-commit', details, [
    documentNodeId,
    props.document.editorContent,
    props.navigation.activeNodeId
  ]);
  return finishDiagnostic;
}
