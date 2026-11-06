import { useCallback, useRef } from 'react';

import { useEditorDraftSync } from '../hooks/useEditorDraftSync';

import { useWorkspaceEditorBaseHold } from './useWorkspaceEditorBaseHold';

export function useProtectedWorkspaceEditorDraft(args: Parameters<typeof useEditorDraftSync>[0]) {
  const draftRef = useRef<ReturnType<typeof useEditorDraftSync> | null>(null);
  const flushDraft = useCallback(() => draftRef.current?.flushDraftSynchronously() ?? false, []);
  const readDraftBaseVersionId = useCallback((nodeId: string) => draftRef.current?.readDraftBaseVersionId(nodeId), []);
  const settleBufferedInput = useCallback(async (nodeId: string) => {
    await draftRef.current?.settleBufferedInput(nodeId);
  }, []);
  const hold = useWorkspaceEditorBaseHold({
    content: args.committedContent,
    versionId: args.committedVersionId,
    nodeId: args.nodeId,
    flushDraft,
    readDraftBaseVersionId,
    settleBufferedInput
  });
  const draft = useEditorDraftSync({ ...args,
    committedContent: hold.document.content, committedVersionId: hold.document.versionId });
  draftRef.current = draft;
  return { ...draft, holdReady: hold.ready };
}
