import { cn } from '../../../shared/lib/utils';

import { NodeRenameInput, type useRenameState } from './NodeTreeRowRename';

export function renderNodeLabel(label: string, rename: ReturnType<typeof useRenameState>) {
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
  return <span className="block min-w-0 flex-1 truncate">{label}</span>;
}

export function NodeTreeRowExpandToggle(props: {
  hasChildren: boolean;
  isCollapsed: boolean;
  label: string;
  nodeId: string;
  onToggleCollapse: (nodeId: string) => void;
}) {
  if (!props.hasChildren) {
    return <span aria-hidden="true" className="mr-2 size-[1.125rem] flex-none" />;
  }
  return (
    <span
      aria-label={props.isCollapsed ? `Expand ${props.label}` : `Collapse ${props.label}`}
      className="mr-2 flex size-[1.125rem] flex-none items-center justify-center opacity-70"
      onClick={(event) => (event.stopPropagation(), props.onToggleCollapse(props.nodeId))}
      onKeyDown={(event) =>
        event.key === 'Enter' || event.key === ' '
          ? (event.preventDefault(), event.stopPropagation(), props.onToggleCollapse(props.nodeId))
          : undefined
      }
      role="button"
      tabIndex={0}
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
