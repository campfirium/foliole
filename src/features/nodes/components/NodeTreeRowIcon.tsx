import { Folder, FolderOpen } from 'lucide-react';

import { cn } from '../../../shared/lib/utils';

import { getNodeIconStateAppearance } from './nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { NodeTreeRowPresetIcon, resolveNodeIconPresetTransformMode } from './NodeTreeRowPresetIcon';

interface NodeTreeRowIconProps {
  kind: NodeTreeRowIconKind;
  state: NodeTreeRowIconState;
}

function iconTransformClass(transformMode: 'none' | 'flip-x' | 'flip-y') {
  if (transformMode === 'flip-x') {
    return '[transform:scaleX(-1)]';
  }
  if (transformMode === 'flip-y') {
    return '[transform:scaleY(-1)]';
  }
  return '';
}

function resolveDefaultIconClassName(transformMode: 'none' | 'flip-x' | 'flip-y') {
  return cn(
    'size-3.5',
    iconTransformClass(transformMode)
  );
}

export function NodeTreeRowIcon({ kind, state }: NodeTreeRowIconProps) {
  if (kind === 'folder-closed' || kind === 'folder-open') {
    return <NodeTreeFolderIcon kind={kind} />;
  }

  const stateAppearance = getNodeIconStateAppearance(state);
  const fallbackShape = kind === 'review' ? 'diamond' : 'hexagon';
  const transformMode = resolveNodeIconPresetTransformMode(kind, fallbackShape);
  const pattern = stateAppearance.strokeStyle === 'dashed' ? 'dash' : 'normal';
  const iconStyle = {
    ['--node-icon-custom-color' as const]: stateAppearance.color,
    opacity: stateAppearance.fadeEnabled && !stateAppearance.fadeWholeRow ? stateAppearance.fadeOpacity : 1,
    ['--node-icon-dash-length' as const]: String(stateAppearance.dashLength),
    ['--node-icon-gap-length' as const]: String(stateAppearance.gapLength),
    ['--node-icon-stroke-width' as const]: String(stateAppearance.lineWidth)
  };
  const iconClassName = cn(
    'relative mr-1 inline-flex size-3.5 flex-none items-center justify-center text-foreground/65'
  );
  return (
    <span
      className={iconClassName}
      style={iconStyle}
      data-node-icon="leaf"
      data-node-icon-kind={kind}
      data-node-icon-pattern={pattern}
      data-node-icon-shape={fallbackShape}
      data-node-icon-source="default"
      data-node-icon-state={state}
      data-node-icon-stroke-style={stateAppearance.strokeStyle}
      data-node-icon-mirror={transformMode}
      data-node-icon-tone="normal"
      data-node-icon-variant={kind}
    >
      <span className={resolveDefaultIconClassName(transformMode)}>
        <NodeTreeRowPresetIcon shape={fallbackShape} />
      </span>
    </span>
  );
}

function NodeTreeFolderIcon({ kind }: { kind: 'folder-closed' | 'folder-open' }) {
  const FolderIcon = kind === 'folder-open' ? FolderOpen : Folder;

  return (
    <span
      className="relative mr-1 inline-flex size-3.5 flex-none items-center justify-center text-foreground/65"
      data-node-icon="folder"
      data-node-icon-kind={kind}
      data-node-icon-pattern="normal"
      data-node-icon-source="default"
      data-node-icon-state="static"
      data-node-icon-tone="normal"
      data-node-icon-variant={kind}
    >
      <FolderIcon aria-hidden="true" size={14} strokeWidth={1.8} />
    </span>
  );
}
