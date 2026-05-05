import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';
import { buildDocumentSectionProps } from './workspaceDocumentSectionProps';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function WorkspaceDocumentSurface(args: {
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  props: WorkspaceLayoutProps;
}) {
  const { editorAppearanceKey } = useAppearanceSettings();
  if (args.props.isExternalViewOpen) {
    return (
      <ExternalLibraryDocumentSurface
        canGoBack={args.props.canGoBack}
        canGoForward={args.props.canGoForward}
        documentMaxWidth={args.props.documentMaxWidth}
        entriesByFolderId={args.props.externalEntriesByFolderId}
        folders={args.props.externalFolders}
        onGoBack={args.props.onGoBack}
        onGoForward={args.props.onGoForward}
        onOpenImportedNode={(result) => {
          if (result.node_id) {
            args.props.onSelectNode(result.node_id);
          }
        }}
        onOpenSelection={args.props.onOpenExternalSelection}
        onResetLayout={args.props.onResetLayout}
        onStartDocumentResize={args.props.onStartDocumentResize}
        selection={args.props.externalSelection}
      />
    );
  }

  return (
    <DocumentPanelSection
      {...buildDocumentSectionProps(
        args.documentNodeId,
        editorAppearanceKey,
        args.isImmersiveEditing,
        args.onShouldSuppressSelectionRestore,
        args.props
      )}
      onEnterImmersiveEdit={args.onEnterImmersiveEdit}
    />
  );
}
