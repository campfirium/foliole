import { Folder, FolderOpen } from 'lucide-react';

import { cn } from '../../../shared/lib/utils';
import { LucideCatalogIcon } from '../../../shared/ui';

import { DEFAULT_NODE_ICON_STATE_APPEARANCE, getNodeIconStateAppearance } from './nodeIconAppearanceSettings';
import { resolveNodeTreeRowIconSource } from './nodeIconSvgSettings';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { NodeTreeRowPresetIcon, resolveNodeIconPresetTransformMode } from './NodeTreeRowPresetIcon';

interface NodeTreeRowIconProps {
  baseOnly?: boolean;
  kind: NodeTreeRowIconKind;
  preview?: boolean;
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

function resolveCustomIconClassName(transformMode: 'none' | 'flip-x' | 'flip-y', preview = false) {
  return cn(
    preview ? 'inline-flex size-6 items-center justify-center' : 'inline-flex size-3.5 items-center justify-center',
    iconTransformClass(transformMode)
  );
}

function resolveDefaultIconClassName(transformMode: 'none' | 'flip-x' | 'flip-y', preview = false) {
  return cn(
    preview ? 'size-6' : 'size-3.5',
    iconTransformClass(transformMode)
  );
}

function NodeTreeRowIconGraphic(props: {
  customMarkup: string;
  doubleLineDistance: number;
  effect: 'none' | 'double-line';
  fallbackShape: 'diamond' | 'hexagon';
  iconId: string;
  preview?: boolean;
  transformMode: 'none' | 'flip-x' | 'flip-y';
}) {
  const innerScale = Math.max(0.5, Math.min(0.96, 1 - props.doubleLineDistance / 16));
  if (props.customMarkup) {
    return (
      <span className={cn(resolveCustomIconClassName(props.transformMode, props.preview), props.effect === 'double-line' && 'relative')}>
        <span dangerouslySetInnerHTML={{ __html: props.customMarkup }} />
        {props.effect === 'double-line' ? (
          <span
            aria-hidden="true"
            className="absolute inset-0"
            dangerouslySetInnerHTML={{ __html: props.customMarkup }}
            style={{ transform: `scale(${innerScale})` }}
          />
        ) : null}
      </span>
    );
  }
  if (props.iconId) {
    return (
      <span className={cn(resolveDefaultIconClassName(props.transformMode, props.preview), props.effect === 'double-line' && 'relative inline-flex items-center justify-center')}>
        <LucideCatalogIcon iconId={props.iconId} size={props.preview ? 24 : 14} strokeWidth={1.75} />
        {props.effect === 'double-line' ? (
          <span aria-hidden="true" className="absolute inset-0 inline-flex items-center justify-center" style={{ transform: `scale(${innerScale})` }}>
            <LucideCatalogIcon iconId={props.iconId} size={props.preview ? 24 : 14} strokeWidth={1.75} />
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className={resolveDefaultIconClassName(props.transformMode, props.preview)}>
      <NodeTreeRowPresetIcon
        doubleLineDistance={props.doubleLineDistance}
        effect={props.effect}
        preview={props.preview}
        shape={props.fallbackShape}
      />
    </span>
  );
}

export function NodeTreeRowIcon({ baseOnly = false, kind, preview = false, state }: NodeTreeRowIconProps) {
  if (kind === 'folder-closed' || kind === 'folder-open') {
    return <NodeTreeFolderIcon kind={kind} />;
  }

  const stateAppearance = baseOnly ? DEFAULT_NODE_ICON_STATE_APPEARANCE[state] : getNodeIconStateAppearance(state, kind);
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
  const graphicProps = {
    customMarkup: customIcon.markup ?? '',
    doubleLineDistance: stateAppearance.doubleLineDistance,
    effect: baseOnly ? 'none' : stateAppearance.effect,
    fallbackShape: fallbackShape as 'diamond' | 'hexagon',
    iconId: customIcon.iconId ?? '',
    preview,
    transformMode
  };
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
