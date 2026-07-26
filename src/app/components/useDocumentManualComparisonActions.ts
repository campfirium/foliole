import { useCallback, type MutableRefObject } from 'react';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import type { SourceUpdateDraft } from './sourceUpdateDraftState';

export function useDocumentManualComparisonActions(args: {
  clearPanel: () => void;
  draftRef: MutableRefObject<SourceUpdateDraft | null>;
  flushLeftDraft: () => void;
  manualContent: string;
  props: DocumentPanelSectionProps;
}) {
  const setAsBody = useCallback(async () => {
    if (!args.props.editorNodeId || !args.manualContent.trim()) return;
    args.props.onNodeContentChange(args.props.editorNodeId, args.manualContent);
    args.clearPanel();
  }, [args]);

  const saveAsTopic = useCallback(async () => {
    if (!args.props.activeNodeId || !args.props.onCreateChildNode || !args.manualContent.trim()) return;
    args.flushLeftDraft();
    if (args.draftRef.current) {
      args.draftRef.current = { ...args.draftRef.current, baseContent: args.draftRef.current.content };
    }
    const createdNodeId = await args.props.onCreateChildNode(
      args.props.activeNodeId,
      args.manualContent,
      'topic'
    );
    if (!createdNodeId) return;
    args.clearPanel();
    args.props.onSelectNode(createdNodeId);
  }, [args]);

  return { saveAsTopic, setAsBody };
}
