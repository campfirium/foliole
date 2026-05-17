import { VIRTUAL_REMOVED_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';
import type { ExternalDocumentPreviewLoadState } from './externalSearchPreviewState';
import { RemovedSourcePreviewSurface } from './RemovedSourcePreviewSurface';
import { buildDocumentSectionProps } from './workspaceDocumentSectionProps';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';

const EMPTY_EXTERNAL_PREVIEW_STATE: ExternalDocumentPreviewLoadState = {
  error: null,
  isLoading: false,
  preview: null,
  retry: () => undefined
};

export function WorkspaceDocumentSurface(props: WorkspaceDocumentSurfaceProps) {
  const { editorAppearanceKey, readingContentWidth } = useAppearanceSettings();
  if (props.isExternalViewOpen) {
    return (
      <ExternalLibraryDocumentSurface
        canGoBack={props.canGoBack}
        canGoForward={props.canGoForward}
        documentMaxWidth={readingContentWidth}
        editorAppearanceKey={editorAppearanceKey}
        entriesByFolderId={props.externalEntriesByFolderId}
        folders={props.externalFolders}
        onGoBack={props.onGoBack}
        onGoForward={props.onGoForward}
        onOpenImportedNode={(result) => {
          if (result.node_id) {
            props.onSelectNode(result.node_id);
          }
        }}
        onOpenImportedNodeId={props.onSelectNode}
        onOpenSelection={props.onOpenExternalSelection}
        onPreviewEditorReady={props.onExternalPreviewEditorReady ?? (() => undefined)}
        previewState={props.externalPreviewState ?? EMPTY_EXTERNAL_PREVIEW_STATE}
        selection={props.externalSelection}
      />
    );
  }

  if (props.isVirtualViewOpen && props.activeVirtualNodeId === VIRTUAL_REMOVED_NODE_ID) {
    return (
      <RemovedSourcePreviewSurface
        canGoBack={props.canGoBack}
        canGoForward={props.canGoForward}
        documentMaxWidth={readingContentWidth}
        editorAppearanceKey={editorAppearanceKey}
        onGoBack={props.onGoBack}
        onGoForward={props.onGoForward}
        onSelectNode={props.onSelectNode}
      />
    );
  }

  return (
    <DocumentPanelSection
      {...buildDocumentSectionProps(
        props.documentNodeId,
        editorAppearanceKey,
        props.isImmersiveEditing,
        props.onShouldSuppressSelectionRestore,
        props
      )}
      onEnterImmersiveEdit={props.onEnterImmersiveEdit}
    />
  );
}
