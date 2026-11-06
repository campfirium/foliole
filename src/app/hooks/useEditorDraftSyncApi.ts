import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';

import type { useEditorDraftUserInputEvidence } from './useEditorDraftUserInputEvidence';

export function createEditorDraftSyncApi(args: {
  editorContent: string;
  flushDraft: (finalizeTitle?: boolean, options?: { syncCommit?: boolean }) => { flushed: boolean };
  handleEditorChange: (content: string, meta?: EditorContentChangeMeta) => void;
  handleEditorInput: (meta?: EditorContentChangeMeta) => void;
  userInputEvidence: Pick<ReturnType<typeof useEditorDraftUserInputEvidence>, 'readDraftBaseVersionId' | 'waitForBufferedInput'>;
}) {
  return {
    editorContent: args.editorContent,
    flushDraft: () => args.flushDraft(false).flushed,
    flushDraftSynchronously: () => args.flushDraft(false, { syncCommit: true }).flushed,
    handleEditorChange: args.handleEditorChange,
    handleEditorInput: args.handleEditorInput,
    readDraftBaseVersionId: args.userInputEvidence.readDraftBaseVersionId,
    settleBufferedInput: args.userInputEvidence.waitForBufferedInput
  };
}
