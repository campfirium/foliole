import { useCallback, type MutableRefObject } from 'react';

import {
  acceptRuntimeIncomingUpdate,
  dismissRuntimeIncomingUpdate,
  importRuntimeIncomingUpdateAsNew
} from '../../shared/platform/nodeSourceRuntimeRepository';
import {
  dismissRuntimeNodeTextAlternative,
  promoteRuntimeNodeTextAlternative
} from '../../shared/platform/nodeTextAlternativeRuntimeRepository';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import type { SourceUpdateDraft } from './sourceUpdateDraftState';
import type { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';

export function useDocumentComparisonSourceActions(args: {
  clearPanel: () => void;
  props: DocumentPanelSectionProps;
  sourceUpdateDraftContent: string | null;
  sourceUpdateDraftRef: MutableRefObject<SourceUpdateDraft | null>;
  sourceUpdatePreview: ReturnType<typeof useNodeSourceUpdatePreview>;
}) {
  const preview = args.sourceUpdatePreview.value;
  const incomingUpdateId = preview?.incomingUpdateId ?? null;
  const alternativeId = preview?.alternativeId ?? null;

  const accept = useCallback(async () => {
    if (alternativeId) {
      await promoteRuntimeNodeTextAlternative(alternativeId);
      args.clearPanel();
      return;
    }
    if (!incomingUpdateId) return;
    const draft = args.sourceUpdateDraftRef.current;
    const content = draft && draft.content !== draft.baseContent
      ? draft.content
      : preview?.updatedContent ?? args.sourceUpdateDraftContent ?? args.props.editorContent;
    const result = await acceptRuntimeIncomingUpdate(incomingUpdateId, content);
    if (result?.status === 'accepted' && result.nodeId) {
      args.props.onNodeContentChange(result.nodeId, content, { publishLocal: false });
    }
    args.clearPanel();
  }, [alternativeId, args, incomingUpdateId, preview?.updatedContent]);

  const dismiss = useCallback(async () => {
    if (alternativeId) {
      await dismissRuntimeNodeTextAlternative(alternativeId);
      args.clearPanel();
      return;
    }
    if (!incomingUpdateId) return;
    await dismissRuntimeIncomingUpdate(incomingUpdateId);
    args.clearPanel();
  }, [alternativeId, args, incomingUpdateId]);

  const importAsNew = useCallback(async () => {
    if (!incomingUpdateId) return;
    await importRuntimeIncomingUpdateAsNew(incomingUpdateId);
    args.clearPanel();
  }, [args, incomingUpdateId]);

  return {
    handleIncomingUpdateAccept: incomingUpdateId || alternativeId ? accept : undefined,
    handleIncomingUpdateDismiss: incomingUpdateId || alternativeId ? dismiss : undefined,
    handleIncomingUpdateImportAsNew: incomingUpdateId && !alternativeId ? importAsNew : undefined
  };
}
