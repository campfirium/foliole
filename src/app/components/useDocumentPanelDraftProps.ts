import { useCallback, useMemo } from 'react';

import { isProtectedRootNode } from '../../features/nodes/model/specialNodes';
import type { EditorDraftCommitOptions } from '../hooks/useEditorDraftFlushCallbacks';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import { useProtectedWorkspaceEditorDraft } from './useProtectedWorkspaceEditorDraft';
import { useWorkspaceContentEditingSession } from './useWorkspaceContentEditingSession';

export function useDocumentPanelDraftProps(props: DocumentPanelSectionProps) {
  const draftNodeId = useMemo(() => {
    if (props.editorNodeId) {
      return props.editorNodeId;
    }
    const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
    if (!activeNode || props.trashedNodeIds.includes(activeNode.id) || isProtectedRootNode(activeNode)) {
      return null;
    }
    return activeNode.id;
  }, [props.activeNodeId, props.editorNodeId, props.nodesById, props.trashedNodeIds]);
  const commitEditorContent = useCallback((nodeId: string | null, content: string, options?: EditorDraftCommitOptions) => {
    if (nodeId) {
      props.onNodeContentChange(nodeId, content, options);
      return;
    }
    props.onEditorChange(content);
  }, [props.onEditorChange, props.onNodeContentChange]);
  const editorDraft = useProtectedWorkspaceEditorDraft({
    committedContent: props.editorContent,
    committedVersionId: draftNodeId ? props.nodesById[draftNodeId]?.currentVersionId : undefined,
    nodeId: draftNodeId,
    onCommit: commitEditorContent,
    ...(props.onFinalizeNodeTitle ? { onFinalizeNode: props.onFinalizeNodeTitle } : {}),
    ...(props.onRegisterEditorDraftFlush ? { onRegisterFlush: props.onRegisterEditorDraftFlush } : {})
  });
  const holdReady = editorDraft.holdReady;
  const handleEditorInput = useWorkspaceContentEditingSession(draftNodeId, props.isEditorReadOnly, editorDraft);
  const handleEditorUndo = useCallback(() => {
    return props.onEditorUndo?.() ?? false;
  }, [props.onEditorUndo]);
  const handleEditorRedo = useCallback(() => {
    return props.onEditorRedo?.() ?? false;
  }, [props.onEditorRedo]);
  return useMemo(
    () => ({
      ...props,
      editorContent: editorDraft.editorContent,
      editorNodeId: draftNodeId,
      isEditorReadOnly: props.isEditorReadOnly || !holdReady,
      onEditorChange: editorDraft.handleEditorChange,
      onEditorInput: handleEditorInput,
      onEditorUndo: handleEditorUndo,
      onEditorRedo: handleEditorRedo
    }),
    [draftNodeId, editorDraft.editorContent, editorDraft.handleEditorChange, handleEditorInput, handleEditorRedo, handleEditorUndo, holdReady, props]
  );
}
