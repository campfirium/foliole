import { cn } from '../../../shared/lib/utils';
import { TruncatedTextTooltip } from '../../../shared/ui';
import { projectNodeListLabel } from '../model/nodeListLabelProjection';

import { NodeRenameInput, type useRenameState } from './NodeTreeRowRename';

export function renderNodeLabel(label: string, rename: ReturnType<typeof useRenameState>, className = 'block min-w-0 flex-1 truncate') {
  if (rename.isRenaming) {
    return (
      <NodeRenameInput
        draftTitle={rename.draftTitle}
        label={label}
        onCancel={rename.cancelRename}
        onChange={rename.setDraftTitle}
        onSubmit={rename.submitRename}
      />
    );
  }
  const projectedLabel = projectNodeListLabel(label);
  return (
    <TruncatedTextTooltip className={className} text={projectedLabel}>
      {projectedLabel}
    </TruncatedTextTooltip>
  );
}

export function NodeTreeRowExpandToggle(props: {
  hasChildren: boolean;
  isCollapsed: boolean;
  nodeId: string;
  onToggleCollapse: (nodeId: string) => void;
}) {
  if (!props.hasChildren) {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none mr-2 flex size-[1.125rem] flex-none items-center justify-center opacity-15"
        data-node-tree-chevron-placeholder="true"
      >
        <ChevronDownIcon className="-rotate-90" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="mr-2 flex size-[1.125rem] flex-none items-center justify-center opacity-70"
      data-node-tree-chevron="true"
      onClick={(event) => (event.stopPropagation(), props.onToggleCollapse(props.nodeId))}
    >
      <ChevronDownIcon className={cn(props.isCollapsed && '-rotate-90')} />
    </span>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('h-[1.125rem] w-[1.125rem] transition-transform', className)}
      viewBox="0 0 16 16"
    >
      <path
        d="M4.5 6.5 8 10l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}
