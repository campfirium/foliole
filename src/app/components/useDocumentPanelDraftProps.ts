import { useCallback, useMemo, useRef } from 'react';

import { isProtectedRootNode } from '../../features/nodes/model/specialNodes';
import type { EditorDraftCommitOptions, EditorDraftFlushRegistration } from '../hooks/useEditorDraftFlushCallbacks';
import { useEditorDraftSync } from '../hooks/useEditorDraftSync';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import { useWorkspaceContentEditingSession } from './useWorkspaceContentEditingSession';

function useInputFlushRegistration(register: EditorDraftFlushRegistration | undefined) {
  const inputReady = useRef(async () => true);
  const registerFlush = useCallback<EditorDraftFlushRegistration>((flush, closeFlush, freshFlush) => {
    register?.(flush, closeFlush ? async () => {
      if (!await inputReady.current()) return false;
      return closeFlush();
    } : null, freshFlush);
  }, [register]);
  return { inputReady, registerFlush };
}

export function useDocumentPanelDraftProps(props: DocumentPanelSectionProps) {
  const flushRegistration = useInputFlushRegistration(props.onRegisterEditorDraftFlush);
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
    committedVersionId: draftNodeId ? props.nodesById[draftNodeId]?.currentVersionId : undefined,
    nodeId: draftNodeId,
    onCommit: commitEditorContent,
    ...(props.onFinalizeNodeTitle ? { onFinalizeNode: props.onFinalizeNodeTitle } : {}),
    onRegisterFlush: flushRegistration.registerFlush
  });
  const sessionReadOnly = props.isEditorReadOnly || Boolean(props.isImmersiveMode && !props.isImmersiveEditing);
  const { handleEditorFocus, handleEditorInput, handlePendingInput, finishEditing, settleAcceptedInput } =
    useWorkspaceContentEditingSession(draftNodeId, sessionReadOnly, editorDraft);
  flushRegistration.inputReady.current = settleAcceptedInput;
  const handleExitEditorFocus = useCallback(() => {
    void finishEditing();
    return props.onExitEditorFocus?.() ?? false;
  }, [finishEditing, props.onExitEditorFocus]);
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
      isEditorReadOnly: props.isEditorReadOnly,
      onEditorChange: editorDraft.handleEditorChange,
      onEditorInput: handleEditorInput,
      onEditorPendingInput: handlePendingInput,
      onEditorFocus: handleEditorFocus,
      onEditorFocusLeave: finishEditing,
      onExitEditorFocus: handleExitEditorFocus,
      onEditorUndo: handleEditorUndo,
      onEditorRedo: handleEditorRedo
    }),
    [draftNodeId, editorDraft.editorContent, editorDraft.handleEditorChange, handleEditorFocus, handleEditorInput, handlePendingInput, handleExitEditorFocus, handleEditorRedo, handleEditorUndo, props]
  );
}
