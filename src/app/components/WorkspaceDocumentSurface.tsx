import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';
import { buildDocumentSectionProps } from './workspaceDocumentSectionProps';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';

export function WorkspaceDocumentSurface(props: WorkspaceDocumentSurfaceProps) {
  const { editorAppearanceKey, readingContentWidth } = useAppearanceSettings();
  if (props.isExternalViewOpen) {
    return (
      <ExternalLibraryDocumentSurface
        canGoBack={props.canGoBack}
        canGoForward={props.canGoForward}
        documentMaxWidth={readingContentWidth}
        entriesByFolderId={props.externalEntriesByFolderId}
        folders={props.externalFolders}
        onGoBack={props.onGoBack}
        onGoForward={props.onGoForward}
        onOpenImportedNode={(result) => {
          if (result.node_id) {
            props.onSelectNode(result.node_id);
          }
        }}
        onOpenSelection={props.onOpenExternalSelection}
        selection={props.externalSelection}
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
