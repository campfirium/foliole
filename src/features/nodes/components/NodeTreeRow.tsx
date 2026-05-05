import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';

import { cn } from '../../../lib/utils';
import { AppButton } from '../../../shared/ui';

interface NodeTreeRowProps {
  depth: number;
  isActive: boolean;
  isSelected: boolean;
  label: string;
  nodeId: string;
  onContextMenu?: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  showBranch: boolean;
}

export function NodeTreeRow({
  depth,
  isActive,
  isSelected,
  label,
  nodeId,
  onContextMenu,
  onSelect,
  showBranch
}: NodeTreeRowProps) {
  const style = {
    '--node-depth': depth
  } as CSSProperties;

  return (
    <AppButton
      active={isSelected}
      aria-current={isActive ? 'page' : undefined}
      aria-pressed={isSelected}
      className="gap-2 pl-[calc(0.5rem+var(--node-depth,0)*1rem)] pr-4"
      onContextMenu={onContextMenu ? (event) => onContextMenu(nodeId, event) : undefined}
      onClick={(event) => onSelect(nodeId, event)}
      style={style}
      variant="list"
    >
      <span aria-hidden="true" className={cn('flex size-3 flex-none items-center justify-center opacity-0', showBranch && 'opacity-70')}>
        <ChevronDownIcon />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </AppButton>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 16 16">
      <path d="M4.5 6.5 8 10l3.5-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.05" />
    </svg>
  );
}
