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
        folders={args.props.externalFolders}
        onOpenImportedNode={(result) => {
          if (result.node_id) {
            args.props.onSelectNode(result.node_id);
          }
        }}
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
