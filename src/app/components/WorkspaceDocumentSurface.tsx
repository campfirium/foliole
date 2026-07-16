import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isVirtualNode
} from '../../features/nodes/model/specialNodes';
import { buildVirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { ScalablePanel } from '../../shared/ui';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';
import type { ExternalDocumentPreviewLoadState } from './externalSearchPreviewState';
import { VirtualBuiltInDocumentSurface } from './VirtualDocumentSurface';
import { buildDocumentSectionProps } from './workspaceDocumentSectionProps';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';
import { resolveVirtualContentItemIds } from './workspaceVirtualContentModel';

const EMPTY_EXTERNAL_PREVIEW_STATE: ExternalDocumentPreviewLoadState = {
  error: null,
  isLoading: false,
  preview: null,
  retry: () => undefined
};

function resolveDocumentNodeId(props: WorkspaceDocumentSurfaceProps) {
  if (!props.isVirtualViewOpen) {
    return props.documentNodeId;
  }
  const activeVirtualNodeId = props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID;
  if (
    activeVirtualNodeId === VIRTUAL_ROOT_NODE_ID ||
    isVirtualNode(props.nodesById[activeVirtualNodeId])
  ) {
    return props.documentNodeId;
  }
  if (
    activeVirtualNodeId !== VIRTUAL_SHELVED_NODE_ID &&
    activeVirtualNodeId !== VIRTUAL_REMOVED_NODE_ID
  ) {
    return props.documentNodeId;
  }
  const itemIds = resolveVirtualContentItemIds(
    props,
    buildVirtualNodeResultIndex(props)
  );
  return props.documentNodeId && itemIds.includes(props.documentNodeId)
    ? props.documentNodeId
    : null;
}

function renderExternalDocumentSurface(
  props: WorkspaceDocumentSurfaceProps,
  editorAppearanceKey: string,
  readingContentWidth: number
) {
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
export function WorkspaceDocumentSurface(props: WorkspaceDocumentSurfaceProps) {
  const { editorAppearanceKey, readingContentWidth } = useAppearanceSettings();
  const documentNodeId = resolveDocumentNodeId(props);
  if (props.isExternalViewOpen) {
    return renderExternalDocumentSurface(props, editorAppearanceKey, readingContentWidth);
  }

  if (
    props.isVirtualViewOpen &&
    (props.activeVirtualNodeId === VIRTUAL_SHELVED_NODE_ID || props.activeVirtualNodeId === VIRTUAL_REMOVED_NODE_ID)
  ) {
    return (
      <ScalablePanel className="flex flex-1" label="List panel" panelId="list-panel">
        <VirtualBuiltInDocumentSurface
          activeVirtualNodeId={props.activeVirtualNodeId ?? null}
          nodeOrder={props.nodeOrder}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          onSelectNodePath={props.onSelectNode}
          trashedNodeIds={props.trashedNodeIds}
        />
      </ScalablePanel>
    );
  }

  return (
    <DocumentPanelSection
      {...buildDocumentSectionProps(
        documentNodeId,
        editorAppearanceKey,
        props.isImmersiveEditing,
        props.onShouldSuppressSelectionRestore,
        props
      )}
      onEnterImmersiveEdit={props.onEnterImmersiveEdit}
    />
  );
}
