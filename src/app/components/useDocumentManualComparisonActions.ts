import { useCallback, type MutableRefObject } from 'react';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import type { SourceUpdateDraft } from './sourceUpdateDraftState';

export function useDocumentManualComparisonActions(args: {
  clearPanel: () => void;
  draftRef: MutableRefObject<SourceUpdateDraft | null>;
  flushLeftDraft: () => void;
  manualContentRef: MutableRefObject<string>;
  props: DocumentPanelSectionProps;
}) {
  const setAsBody = useCallback(async () => {
    const content = args.manualContentRef.current;
    if (!args.props.editorNodeId || !content.trim()) return;
    args.props.onNodeContentChange(args.props.editorNodeId, content);
    args.clearPanel();
  }, [args]);

  const saveAsTopic = useCallback(async () => {
    const content = args.manualContentRef.current;
    if (!args.props.activeNodeId || !args.props.onCreateChildNode || !content.trim()) return;
    args.flushLeftDraft();
    if (args.draftRef.current) {
      args.draftRef.current = { ...args.draftRef.current, baseContent: args.draftRef.current.content };
    }
    const createdNodeId = await args.props.onCreateChildNode(
      args.props.activeNodeId,
      content,
      'topic'
    );
    if (!createdNodeId) return;
    args.clearPanel();
    args.props.onSelectNode(createdNodeId);
  }, [args]);

  return { saveAsTopic, setAsBody };
}
