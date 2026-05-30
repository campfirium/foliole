import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import {
  startWorkspaceDiagnostic,
  useWorkspaceRenderDiagnostic,
  type DiagnosticValue
} from './workspaceInputLagRenderDiagnostic';

export function useDocumentPanelSectionDiagnostic(props: DocumentPanelSectionProps) {
  useWorkspaceRenderDiagnostic('document-panel-section-render', {
    activeNodeId: props.activeNodeId,
    editorContentLength: props.editorContent.length,
    editorNodeId: props.editorNodeId,
    nodesById: props.nodesById,
    nodeOrder: props.nodeOrder
  });
}

export function startDocumentPanelDiagnostic(event: string, values: Record<string, DiagnosticValue>) {
  return startWorkspaceDiagnostic(event, values);
}
