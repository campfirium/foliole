import { DEFAULT_NODE_ICON_COLOR } from '../../../shared/config/defaultAppearanceColors';

import type { NodeTreeRowIconState } from './NodeTreeRowIconModel';

export const NODE_ICON_SHAPE_OPTIONS = ['hexagon', 'diamond', 'circle', 'square', 'triangle', 'leaf'] as const;
export const NODE_ICON_EFFECT_OPTIONS = ['none', 'double-line'] as const;

export type NodeIconShape = (typeof NODE_ICON_SHAPE_OPTIONS)[number];
export type NodeIconEffect = (typeof NODE_ICON_EFFECT_OPTIONS)[number];

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
  fadeWholeRow: boolean;
  innerLineWidth: number;
  innerScale: number;
  lineWidth: number;
  outerLineWidth: number;
  outerScale: number;
  scale: number;
  svg: string;
}

export const DEFAULT_NODE_ICON_BASE_APPEARANCE: NodeIconBaseAppearance = {
  color: DEFAULT_NODE_ICON_COLOR,
  lineWidth: 0.6,
  scale: 1.15
};

export const DEFAULT_NODE_ICON_STATE_APPEARANCE: Record<NodeTreeRowIconState, NodeIconStateAppearance> = {
  pending: {
    color: DEFAULT_NODE_ICON_COLOR,
    doubleLineDistance: 2,
    effect: 'none',
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeWholeRow: false,
    innerLineWidth: 0.6,
    innerScale: 0.78,
    lineWidth: 0.6,
    outerLineWidth: 0.6,
    outerScale: 1,
    scale: 1.15,
    svg: ''
  },
  scheduled: {
    color: DEFAULT_NODE_ICON_COLOR,
    doubleLineDistance: 2,
    effect: 'double-line',
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeWholeRow: false,
    innerLineWidth: 0.6,
    innerScale: 0.78,
    lineWidth: 0.6,
    outerLineWidth: 0.6,
    outerScale: 1.18,
    scale: 1.15,
    svg: ''
  },
  dismissed: {
    color: DEFAULT_NODE_ICON_COLOR,
    doubleLineDistance: 2,
    effect: 'none',
    fadeEnabled: false,
    fadeOpacity: 1,
    fadeWholeRow: false,
    innerLineWidth: 0.6,
    innerScale: 0.78,
    lineWidth: 0.6,
    outerLineWidth: 0.6,
    outerScale: 1,
    scale: 1.15,
    svg: ''
  }
};
