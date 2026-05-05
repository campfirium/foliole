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
      className="gap-2 pl-[calc(0.5rem+var(--node-depth,0)*1rem)]"
      onContextMenu={onContextMenu ? (event) => onContextMenu(nodeId, event) : undefined}
      onClick={(event) => onSelect(nodeId, event)}
      style={style}
      variant="list"
    >
      <span aria-hidden="true" className={cn('h-px w-3 flex-none border-b border-border opacity-0', showBranch && 'opacity-85')} />
      <span className="min-w-0 truncate">{label}</span>
    </AppButton>
  );
}
