import { resolveNodePrioritySetting } from '../../features/nodes/model/nodeReviewSettings';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { PushQueuePriority } from '../../features/review/model/unifiedPushQueueRules';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger
} from '../../shared/ui';

function describePrioritySource(source: 'explicit' | 'inherited' | 'default', value: number, shortcutLabel?: string) {
  const suffix = shortcutLabel ? ` Shortcut ${shortcutLabel}.` : '';
  if (source === 'explicit') {
    return `Priority P${value} set on this node.${suffix}`;
  }
  if (source === 'inherited') {
    return `Priority P${value} inherited from an ancestor.${suffix}`;
  }
  return `Priority P${value} from the default fallback.${suffix}`;
}

function renderPriorityOptionLabel(priority: number, isCurrent: boolean) {
  const baseLabel = priority === 0 ? 'P0 · Absolute privilege' : `P${priority}`;
  return isCurrent ? `${baseLabel} · Current` : baseLabel;
}

interface DocumentPriorityControlProps {
  activeNodeId: string | null;
  defaultPriority: PushQueuePriority;
  editableNodeId: string | null;
  nodesById: Record<string, Node>;
  onPriorityChange: (nodeId: string, priority: number | null) => void;
  shortcutLabel?: string;
}

export function DocumentPriorityControl({
  activeNodeId,
  defaultPriority,
  editableNodeId,
  nodesById,
  onPriorityChange,
  shortcutLabel
}: DocumentPriorityControlProps) {
  if (!activeNodeId) {
    return null;
  }

  const node = nodesById[activeNodeId];
  if (!node) {
    return null;
  }

  const resolvedPriority = resolveNodePrioritySetting(activeNodeId, nodesById, defaultPriority);
  const isEditable = editableNodeId === activeNodeId;
  const buttonLabel = describePrioritySource(resolvedPriority.source, resolvedPriority.value, shortcutLabel);

  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={buttonLabel}
          className="inline-block shrink-0 overflow-hidden border-0 bg-transparent p-0 text-left align-baseline text-sm font-normal leading-[1.25] text-foreground/50 text-ellipsis hover:text-foreground/70 disabled:cursor-default disabled:opacity-55"
          disabled={!isEditable}
          title={buttonLabel}
          type="button"
        >
          {`P${resolvedPriority.value}`}
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" sideOffset={6}>
        <AppDropdownMenuItem
          disabled={!isEditable || node.priority == null}
          onSelect={() => onPriorityChange(activeNodeId, null)}
        >
          {`Use inherited value (now P${resolvedPriority.value})`}
        </AppDropdownMenuItem>
        {Array.from({ length: 10 }, (_, priority) => (
          <AppDropdownMenuItem
            key={priority}
            disabled={!isEditable}
            onSelect={() => onPriorityChange(activeNodeId, priority)}
          >
            {renderPriorityOptionLabel(priority, node.priority === priority)}
          </AppDropdownMenuItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
