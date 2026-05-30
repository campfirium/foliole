import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';

export const NODE_ICON_SHAPE_OPTIONS = ['hexagon', 'diamond', 'circle', 'square', 'triangle', 'leaf'] as const;
export const NODE_ICON_EFFECT_OPTIONS = ['none', 'double-line'] as const;

export type NodeIconShape = (typeof NODE_ICON_SHAPE_OPTIONS)[number];
export type NodeIconEffect = (typeof NODE_ICON_EFFECT_OPTIONS)[number];
export type EditableNodeIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

export interface NodeIconBaseAppearance {
  color: string;
  lineWidth: number;
  scale: number;
}

export interface NodeIconStateAppearance {
  color: string;
  doubleLineDistance: number;
  effect: NodeIconEffect;
  fadeEnabled: boolean;
  fadeOpacity: number;
  fadeTextOpacity: number;
  iconId: string;
  innerLineWidth: number;
  innerScale: number;
  lineWidth: number;
  outerLineWidth: number;
  outerScale: number;
  scale: number;
  svg: string;
}

export const DEFAULT_NODE_ICON_BASE_APPEARANCE: NodeIconBaseAppearance = {
  color: '#444444',
  lineWidth: 0.6,
  scale: 1.15
};

export const DEFAULT_NODE_ICON_BASE_APPEARANCE_BY_KIND: Record<EditableNodeIconKind, NodeIconBaseAppearance> = {
  reading: DEFAULT_NODE_ICON_BASE_APPEARANCE,
  review: {
    color: '#444444',
    lineWidth: 0.6,
    scale: 1.3
  }
};

export const DEFAULT_NODE_ICON_STATE_APPEARANCE: Record<NodeTreeRowIconState, NodeIconStateAppearance> = {
  pending: {
    color: '#444444',
    doubleLineDistance: 2,
    effect: 'none',
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeTextOpacity: 1,
    iconId: '',
    innerLineWidth: 0.6,
    innerScale: 0.78,
    lineWidth: 0.6,
    outerLineWidth: 0.6,
    outerScale: 1,
    scale: 1.15,
    svg: ''
  },
  scheduled: {
    color: '#444444',
    doubleLineDistance: 2,
    effect: 'double-line',
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeTextOpacity: 1,
    iconId: '',
    innerLineWidth: 0.5,
    innerScale: 0.7,
    lineWidth: 0.6,
    outerLineWidth: 0.6,
    outerScale: 1.1,
    scale: 1.15,
    svg: ''
  },
  dismissed: {
    color: '#444444',
    doubleLineDistance: 2,
    effect: 'none',
    fadeEnabled: true,
    fadeOpacity: 0.6,
    fadeTextOpacity: 0.6,
    iconId: '',
    innerLineWidth: 0.6,
    innerScale: 0.78,
    lineWidth: 0.6,
    outerLineWidth: 0.6,
    outerScale: 1,
    scale: 1.15,
    svg: ''
  }
};

export const DEFAULT_NODE_ICON_STATE_APPEARANCE_BY_KIND: Record<
  NodeTreeRowIconState,
  Record<EditableNodeIconKind, NodeIconStateAppearance>
> = {
  pending: {
    reading: DEFAULT_NODE_ICON_STATE_APPEARANCE.pending,
    review: {
      ...DEFAULT_NODE_ICON_STATE_APPEARANCE.pending,
      scale: 1.3
    }
  },
  scheduled: {
    reading: DEFAULT_NODE_ICON_STATE_APPEARANCE.scheduled,
    review: {
      ...DEFAULT_NODE_ICON_STATE_APPEARANCE.scheduled,
      innerScale: 0.8,
      outerLineWidth: 0,
      outerScale: 1.3,
      scale: 1.3
    }
  },
  dismissed: {
    reading: DEFAULT_NODE_ICON_STATE_APPEARANCE.dismissed,
    review: {
      ...DEFAULT_NODE_ICON_STATE_APPEARANCE.dismissed,
      scale: 1.3
    }
  }
};
