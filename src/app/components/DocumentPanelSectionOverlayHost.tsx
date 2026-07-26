import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';

import type { DocumentPanelSectionModel } from './DocumentPanelSection';
import { DocumentPanelSectionOverlays } from './DocumentPanelSectionOverlays';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';

export function DocumentPanelSectionOverlayHost(args: {
  editorAdapter: EditorAdapter | null;
  model: DocumentPanelSectionModel;
  props: DocumentPanelSectionProps;
}) {
  return (
    <DocumentPanelSectionOverlays
      {...definedProps({
        comparisonMode: args.model.comparisonMode,
        comparisonSource: args.model.comparisonSource,
        currentSourceUpdateContent: args.model.currentSourceUpdateContent,
        documentMaxWidth: args.model.bodyProps.documentMaxWidth,
        editorAdapter: args.editorAdapter,
        handleIncomingUpdateAccept: args.model.handleIncomingUpdateAccept,
        handleIncomingUpdateDismiss: args.model.handleIncomingUpdateDismiss,
        handleIncomingUpdateImportAsNew: args.model.handleIncomingUpdateImportAsNew,
        handleManualContentChange: args.model.handleManualContentChange,
        handleManualSaveAsTopic: args.model.handleManualSaveAsTopic,
        handleManualSetAsBody: args.model.handleManualSetAsBody,
        handleSourceUpdateDraftChange: args.model.handleSourceUpdateDraftChange,
        handleSourceUpdatePanelOpenChange: args.model.handleSourceUpdatePanelOpenChange,
        isSourceUpdatePanelOpen: args.model.isSourceUpdatePanelOpen,
        manualContent: args.model.manualContent,
        props: args.props,
        setComparisonSource: args.model.setComparisonSource,
        sourceUpdatePreview: args.model.sourceUpdatePreview
      })}
    />
  );
}
