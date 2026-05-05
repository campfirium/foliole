import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';

import { Button } from '../../../shared/ui';

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
    <Button
      active={isSelected}
      aria-current={isActive ? 'page' : undefined}
      aria-pressed={isSelected}
      className="node-row node-tree-row"
      onContextMenu={onContextMenu ? (event) => onContextMenu(nodeId, event) : undefined}
      onClick={(event) => onSelect(nodeId, event)}
      style={style}
      variant="list"
    >
      <span aria-hidden="true" className="node-tree-branch" data-visible={showBranch} />
      <span className="node-tree-title">{label}</span>
    </Button>
  );
}
