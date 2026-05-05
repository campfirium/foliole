import { Folder, FolderOpen } from 'lucide-react';

import { cn } from '../../../shared/lib/utils';

import { DEFAULT_NODE_ICON_STATE_APPEARANCE, getNodeIconBaseAppearance, getNodeIconStateAppearance } from './nodeIconAppearanceSettings';
import { resolveNodeTreeRowIconSource } from './nodeIconSvgSettings';
import { NodeTreeRowIconGraphic } from './NodeTreeRowIconGraphic';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { resolveNodeIconPresetTransformMode } from './NodeTreeRowPresetIcon';

interface NodeTreeRowIconProps {
  baseOnly?: boolean;
  kind: NodeTreeRowIconKind;
  preview?: boolean;
  state: NodeTreeRowIconState;
}

function resolveStateAppearance(args: {
  baseOnly: boolean;
  kind: NodeTreeRowIconKind;
  state: NodeTreeRowIconState;
}) {
  const baseAppearance = args.kind === 'reading' || args.kind === 'review' ? getNodeIconBaseAppearance(args.kind) : null;
  const appearanceKind = args.kind === 'reading' || args.kind === 'review' ? args.kind : undefined;
  return args.baseOnly && baseAppearance
    ? { ...DEFAULT_NODE_ICON_STATE_APPEARANCE[args.state], color: baseAppearance.color, lineWidth: baseAppearance.lineWidth, scale: baseAppearance.scale }
    : getNodeIconStateAppearance(args.state, appearanceKind);
}

function createGraphicProps(args: {
  customIcon: ReturnType<typeof resolveNodeTreeRowIconSource>;
  effect: 'none' | 'double-line';
  fallbackShape: 'diamond' | 'hexagon';
  preview: boolean;
  stateAppearance: ReturnType<typeof getNodeIconStateAppearance>;
  transformMode: 'none' | 'flip-x' | 'flip-y';
}) {
  return {
    customMarkup: args.customIcon.markup ?? '',
    doubleLineDistance: args.stateAppearance.doubleLineDistance,
    effect: args.effect,
    fallbackShape: args.fallbackShape,
    iconId: args.customIcon.iconId ?? '',
    innerLineWidth: args.stateAppearance.innerLineWidth,
    innerScale: args.stateAppearance.innerScale,
    lineWidth: args.stateAppearance.lineWidth,
    outerLineWidth: args.stateAppearance.outerLineWidth,
    outerScale: args.stateAppearance.outerScale,
    preview: args.preview,
    scale: args.stateAppearance.scale,
    transformMode: args.transformMode
  };
}

export function NodeTreeRowIcon({ baseOnly = false, kind, preview = false, state }: NodeTreeRowIconProps) {
  if (kind === 'folder-closed' || kind === 'folder-open') {
    return <NodeTreeFolderIcon kind={kind} />;
  }

  const stateAppearance = resolveStateAppearance({ baseOnly, kind, state });
  const customIcon = resolveNodeTreeRowIconSource({
    kind,
    state,
    svg: baseOnly ? '' : stateAppearance.svg
  });
  const fallbackShape = kind === 'review' ? 'diamond' : 'hexagon';
  const fallbackTransformMode = resolveNodeIconPresetTransformMode(kind, fallbackShape);
  const transformMode = customIcon.markup ? customIcon.transformMode : fallbackTransformMode;
  const iconStyle = {
    ['--node-icon-custom-color' as const]: stateAppearance.color,
    ['--node-icon-stroke-width' as const]: String(stateAppearance.lineWidth),
    ...(stateAppearance.fadeEnabled && (preview || !stateAppearance.fadeWholeRow) ? { opacity: stateAppearance.fadeOpacity } : {})
  };
  const iconClassName = cn(
    'relative inline-flex flex-none items-center justify-center text-foreground/65',
    preview ? 'm-0 size-6' : 'mr-1 size-3.5'
  );
  const customStyleScope = `${kind}-${state}`;
  const graphicProps = createGraphicProps({ customIcon, effect: baseOnly ? 'none' : stateAppearance.effect, fallbackShape, preview, stateAppearance, transformMode });
  return (
    <span
      className={iconClassName}
      style={iconStyle}
      data-node-icon-custom-style={customStyleScope}
      data-node-icon="leaf"
      data-node-icon-kind={kind}
      data-node-icon-effect={baseOnly ? 'none' : stateAppearance.effect}
      data-node-icon-pattern="normal"
      data-node-icon-shape={fallbackShape}
      data-node-icon-source={customIcon.markup || customIcon.iconId ? 'custom' : 'default'}
      data-node-icon-state={state}
      data-node-icon-mirror={transformMode}
      data-node-icon-tone="normal"
      data-node-icon-variant={kind}
    >
      <NodeTreeRowIconGraphic {...graphicProps} />
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
