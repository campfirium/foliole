import { NodeBreadcrumbs } from '../../features/nodes/components/NodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { PushQueuePriority } from '../../features/review/model/unifiedPushQueueRules';

import { DocumentPriorityControl } from './DocumentPriorityControl';

interface DocumentPanelHeaderCenterProps {
  activeNodeId: string | null;
  defaultPriority: PushQueuePriority;
  editableNodeId: string | null;
  isFolderListView: boolean;
  nodesById: Record<string, Node>;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  priorityQuickSetShortcutLabel: string;
}

export function DocumentPanelHeaderCenter({
  activeNodeId,
  defaultPriority,
  editableNodeId,
  isFolderListView,
  nodesById,
  onNodePriorityChange,
  onSelectBreadcrumbNode,
  priorityQuickSetShortcutLabel
}: DocumentPanelHeaderCenterProps) {
  if (isFolderListView) {
    return <div aria-hidden="true" className="min-h-9 flex-1 border-b border-border/60" />;
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto flex w-full items-center justify-between gap-3 [width:min(100%,var(--document-max-width))]">
        <NodeBreadcrumbs
          activeNodeId={activeNodeId}
          nodesById={toWorkspaceListNodesById(nodesById)}
          onSelectNode={onSelectBreadcrumbNode}
        />
        <DocumentPriorityControl
          activeNodeId={activeNodeId}
          defaultPriority={defaultPriority}
          editableNodeId={editableNodeId}
          nodesById={nodesById}
          onPriorityChange={onNodePriorityChange}
          shortcutLabel={priorityQuickSetShortcutLabel}
        />
      </div>
    </div>
  );
}
