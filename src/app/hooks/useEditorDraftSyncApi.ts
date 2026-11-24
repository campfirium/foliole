import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';

import type { PendingDraftCommit } from './useEditorDraftPendingCommit';
import type { useEditorDraftUserInputEvidence } from './useEditorDraftUserInputEvidence';

export function createEditorDraftSyncApi(args: {
  editorContent: string;
  flushDraft: (finalizeTitle?: boolean, options?: { syncCommit?: boolean }) => { flushed: boolean };
  handleEditorChange: (content: string, meta?: EditorContentChangeMeta) => void;
  handleEditorInput: (meta?: EditorContentChangeMeta) => void;
  getPendingDraftCommit: () => PendingDraftCommit | null;
  userInputEvidence: Pick<ReturnType<typeof useEditorDraftUserInputEvidence>, 'readDraftBaseVersionId' | 'waitForBufferedInput'>;
}) {
  return {
    editorContent: args.editorContent,
    flushDraft: () => args.flushDraft(false).flushed,
    flushDraftSynchronously: (nodeId?: string) => {
      if (nodeId !== undefined && args.getPendingDraftCommit()?.nodeId !== nodeId) return false;
      return args.flushDraft(false, { syncCommit: true }).flushed;
    },
    handleEditorChange: args.handleEditorChange,
    handleEditorInput: args.handleEditorInput,
    readDraftBaseVersionId: args.userInputEvidence.readDraftBaseVersionId,
    settleBufferedInput: args.userInputEvidence.waitForBufferedInput
  };
}
