import { useCallback, useMemo } from 'react';

import { isProtectedRootNode } from '../../features/nodes/model/specialNodes';
import type { EditorDraftCommitOptions } from '../hooks/useEditorDraftFlushCallbacks';
import { useEditorDraftSync } from '../hooks/useEditorDraftSync';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';

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
  const editorDraft = useEditorDraftSync({
    committedContent: props.editorContent,
    nodeId: draftNodeId,
    onCommit: commitEditorContent,
    ...(props.onFinalizeNodeTitle ? { onFinalizeNode: props.onFinalizeNodeTitle } : {}),
    ...(props.onRegisterEditorDraftFlush ? { onRegisterFlush: props.onRegisterEditorDraftFlush } : {})
  });
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
      onEditorChange: editorDraft.handleEditorChange,
      onEditorInput: editorDraft.handleEditorInput,
      onEditorUndo: handleEditorUndo,
      onEditorRedo: handleEditorRedo
    }),
    [draftNodeId, editorDraft.editorContent, editorDraft.handleEditorChange, editorDraft.handleEditorInput, handleEditorRedo, handleEditorUndo, props]
  );
}
