import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import type { DocumentSourceUpdatePanelProps } from './DocumentSourceUpdatePanel';
import type { SourceUpdatePanelSnapshots } from './useSourceUpdatePanelSnapshots';

export function useSourceUpdatePanelLiveProps(
  props: DocumentSourceUpdatePanelProps,
  currentEditor: EditorAdapter | null,
  updatedEditor: EditorAdapter | null,
  snapshots: SourceUpdatePanelSnapshots
) {
  const syncCurrentEditor = () => {
    const content = currentEditor?.getContent() ?? snapshots.current;
    snapshots.setCurrent(content);
    if (content !== props.currentContent) props.onCurrentContentChange(content);
  };
  const syncManualEditor = () => {
    const content = updatedEditor?.getContent() ?? snapshots.updated;
    snapshots.setUpdated(content);
    if (content !== props.manualContent) props.onManualContentChange(content);
  };
  return {
    ...props,
    currentContent: snapshots.current,
    manualContent: props.comparisonMode === 'manual' ? snapshots.updated : props.manualContent,
    onCurrentContentChange: snapshots.setCurrent,
    onManualContentChange: snapshots.setUpdated,
    onManualSaveAsTopic: async () => {
      syncCurrentEditor();
      syncManualEditor();
      await props.onManualSaveAsTopic();
    },
    onManualSetAsBody: async () => {
      syncManualEditor();
      await props.onManualSetAsBody();
    },
    onOpenChange: (open: boolean) => {
      if (!open) syncCurrentEditor();
      props.onOpenChange(open);
    },
    onSourceChange: (source: 'manual' | 'source') => {
      if (props.comparisonMode === 'manual') syncManualEditor();
      props.onSourceChange(source);
    },
    updatedContent: snapshots.updated,
    ...(props.onAcceptIncomingUpdate ? {
      onAcceptIncomingUpdate: async () => {
        syncCurrentEditor();
        await props.onAcceptIncomingUpdate?.();
      }
    } : {})
  };
}
