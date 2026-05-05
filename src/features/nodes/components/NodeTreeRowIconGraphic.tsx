import type { CSSProperties } from 'react';

import { cn } from '../../../shared/lib/utils';
import { LucideCatalogIcon } from '../../../shared/ui';

import { NodeTreeRowPresetIcon } from './NodeTreeRowPresetIcon';

type IconTransformMode = 'none' | 'flip-x' | 'flip-y';

export interface NodeTreeRowIconGraphicProps {
  customMarkup: string;
  doubleLineDistance: number;
  effect: 'none' | 'double-line';
  fallbackShape: 'diamond' | 'hexagon';
  iconId: string;
  innerLineWidth: number;
  innerScale: number;
  lineWidth: number;
  outerLineWidth: number;
  outerScale: number;
  preview?: boolean;
  scale: number;
  transformMode: IconTransformMode;
}

function resolveCustomIconClassName(preview = false) {
  return preview ? 'inline-flex size-6 items-center justify-center' : 'inline-flex size-3.5 items-center justify-center';
}

function resolveDefaultIconClassName(preview = false) {
  return preview ? 'size-6' : 'size-3.5';
}

function strokeWidthStyle(value: number, transform?: string): CSSProperties {
  return { '--node-icon-stroke-width': String(value), ...(transform ? { transform } : {}) } as CSSProperties;
}

function iconTransformStyle(transformMode: IconTransformMode, scale: number): CSSProperties | undefined {
  const transforms = [];
  if (transformMode === 'flip-x') transforms.push('scaleX(-1)');
  if (transformMode === 'flip-y') transforms.push('scaleY(-1)');
  if (scale !== 1) transforms.push(`scale(${scale})`);
  return transforms.length > 0 ? { transform: transforms.join(' ') } : undefined;
}

function DoubleLineCustomMarkup(props: {
  markup: string;
  innerLineWidth: number;
  innerScale: number;
  outerLineWidth: number;
  outerScale: number;
  preview?: boolean;
  transformMode: IconTransformMode;
}) {
  return (
    <span className={cn(resolveCustomIconClassName(props.preview), 'relative')} style={iconTransformStyle(props.transformMode, 1)}>
      <span className="absolute inset-0" dangerouslySetInnerHTML={{ __html: props.markup }} style={strokeWidthStyle(props.outerLineWidth, `scale(${props.outerScale})`)} />
      <span aria-hidden="true" className="absolute inset-0" dangerouslySetInnerHTML={{ __html: props.markup }} style={strokeWidthStyle(props.innerLineWidth, `scale(${props.innerScale})`)} />
    </span>
  );
}

function DoubleLineLucideIcon(props: {
  iconId: string;
  innerLineWidth: number;
  innerScale: number;
  outerLineWidth: number;
  outerScale: number;
  preview?: boolean;
  transformMode: IconTransformMode;
}) {
  return (
    <span className={cn(resolveDefaultIconClassName(props.preview), 'relative inline-flex items-center justify-center')} style={iconTransformStyle(props.transformMode, 1)}>
      <span className="absolute inset-0 inline-flex items-center justify-center" style={{ transform: `scale(${props.outerScale})` }}>
        <LucideCatalogIcon iconId={props.iconId} size={props.preview ? 24 : 14} strokeWidth={props.outerLineWidth} />
      </span>
      <span aria-hidden="true" className="absolute inset-0 inline-flex items-center justify-center" style={{ transform: `scale(${props.innerScale})` }}>
        <LucideCatalogIcon iconId={props.iconId} size={props.preview ? 24 : 14} strokeWidth={props.innerLineWidth} />
      </span>
    </span>
  );
}

export function NodeTreeRowIconGraphic(props: NodeTreeRowIconGraphicProps) {
  const outerScale = props.scale * props.outerScale;
  const innerScale = props.scale * props.innerScale;
  if (props.customMarkup) {
    if (props.effect === 'double-line') {
      return <DoubleLineCustomMarkup innerLineWidth={props.innerLineWidth} innerScale={innerScale} markup={props.customMarkup} outerLineWidth={props.outerLineWidth} outerScale={outerScale} preview={props.preview} transformMode={props.transformMode} />;
    }
    return (
      <span className={resolveCustomIconClassName(props.preview)} style={iconTransformStyle(props.transformMode, props.scale)}>
        <span dangerouslySetInnerHTML={{ __html: props.customMarkup }} />
      </span>
    );
  }
  if (props.iconId) {
    if (props.effect === 'double-line') {
      return <DoubleLineLucideIcon iconId={props.iconId} innerLineWidth={props.innerLineWidth} innerScale={innerScale} outerLineWidth={props.outerLineWidth} outerScale={outerScale} preview={props.preview} transformMode={props.transformMode} />;
    }
    return (
      <span className={resolveDefaultIconClassName(props.preview)} style={iconTransformStyle(props.transformMode, props.scale)}>
        <LucideCatalogIcon iconId={props.iconId} size={props.preview ? 24 : 14} strokeWidth={props.lineWidth} />
      </span>
    );
  }
  return (
    <span className={resolveDefaultIconClassName(props.preview)}>
      <NodeTreeRowPresetIcon
        doubleLineDistance={props.doubleLineDistance}
        effect={props.effect}
        innerLineWidth={props.innerLineWidth}
        innerScale={props.innerScale}
        outerLineWidth={props.outerLineWidth}
        outerScale={props.outerScale}
        preview={props.preview}
        scale={props.scale}
        shape={props.fallbackShape}
      />
    </span>
  );
}
