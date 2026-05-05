import type { ComponentProps } from 'react';

import { VirtualNodeDetailView } from '../../features/nodes/components/VirtualNodeDetailView';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';

import { DocumentPanelBody } from './DocumentPanelBody';
import { EditorContextMenu } from './EditorContextMenu';
import { FolderListView } from './FolderListView';
import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelContentProps {
  activeNodeId: string | null;
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  isFolderListView: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onSelectNode: (nodeId: string) => void;
}

interface DocumentPanelContextMenuProps {
  contextMenu: WorkspaceEditorContextMenu | null;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
}

export function DocumentPanelContent({
  activeNodeId,
  bodyProps,
  isFolderListView,
  nodeOrder,
  nodesById,
  onNodeContentChange,
  onSelectNode
}: DocumentPanelContentProps) {
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  if (activeNode && isVirtualNode(activeNode)) {
    return (
      <VirtualNodeDetailView
        node={activeNode}
        nodesById={nodesById}
        onSelectNode={onSelectNode}
        onUpdateFilter={onNodeContentChange}
      />
    );
  }

  if (isFolderListView && activeNodeId) {
    return (
      <FolderListView
        folderNodeId={activeNodeId}
        nodeOrder={nodeOrder}
        nodesById={nodesById}
        onSelectNode={onSelectNode}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReadwiseBookActionsPanel activeNodeId={activeNodeId} />
      <DocumentPanelBody {...bodyProps} />
    </div>
  );
}

export function DocumentPanelContextMenu({
  contextMenu,
  onCloseContextMenu,
  onCopyImage,
  onCreateHighlight,
  onCreateCloze,
  onCutImage,
  onDeleteImage,
  onExportImage
}: DocumentPanelContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <EditorContextMenu
      canRunCommands={contextMenu.canRunCommands}
      kind={contextMenu.kind}
      left={contextMenu.left}
      onClose={onCloseContextMenu}
      onCopyImage={onCopyImage}
      onCreateCloze={onCreateCloze}
      onCreateHighlight={onCreateHighlight}
      onCutImage={onCutImage}
      onDeleteImage={onDeleteImage}
      onExportImage={onExportImage}
      top={contextMenu.top}
    />
  );
}
