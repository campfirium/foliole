export const VIRTUAL_NODE_FILTER_VERSION = 1;

export type VirtualNodeFilterMatchMode = 'all';
export type VirtualNodeFilterConditionField = 'collection' | 'manual' | 'text';
export type VirtualNodeFilterConditionOperator = 'contains' | 'equals';
const MANUAL_CHILD_ORDER_FILTER_VALUE = 'manual-child-order';

export interface VirtualNodeFilterCondition {
  field: VirtualNodeFilterConditionField;
  operator: VirtualNodeFilterConditionOperator;
  value: string;
}

export interface VirtualNodeFilter {
  version: typeof VIRTUAL_NODE_FILTER_VERSION;
  match: VirtualNodeFilterMatchMode;
  conditions: VirtualNodeFilterCondition[];
}

function isVirtualNodeFilterCondition(value: unknown): value is VirtualNodeFilterCondition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const condition = value as Record<string, unknown>;
  return (
    ((condition.field === 'text' && condition.operator === 'contains') ||
      (condition.field === 'collection' && condition.operator === 'equals') ||
      (condition.field === 'manual' && condition.operator === 'equals')) &&
    typeof condition.value === 'string'
  );
}

export function isVirtualNodeFilter(value: unknown): value is VirtualNodeFilter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const filter = value as Record<string, unknown>;
  return (
    filter.version === VIRTUAL_NODE_FILTER_VERSION &&
    filter.match === 'all' &&
    Array.isArray(filter.conditions) &&
    filter.conditions.every((condition) => isVirtualNodeFilterCondition(condition))
  );
}

export function parseVirtualNodeFilter(value: string | null | undefined): VirtualNodeFilter | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isVirtualNodeFilter(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function stringifyVirtualNodeFilter(value: VirtualNodeFilter | null | undefined): string | null {
  return value ? JSON.stringify(value) : null;
}

export function createCollectionVirtualNodeFilter(name: string): VirtualNodeFilter {
  return {
    conditions: [{ field: 'collection', operator: 'equals', value: name }],
    match: 'all',
    version: VIRTUAL_NODE_FILTER_VERSION
  };
}

export function createManualVirtualNodeFilter(): VirtualNodeFilter {
  return {
    conditions: [{ field: 'manual', operator: 'equals', value: MANUAL_CHILD_ORDER_FILTER_VALUE }],
    match: 'all',
    version: VIRTUAL_NODE_FILTER_VERSION
  };
}

export function isManualVirtualNodeFilter(value: VirtualNodeFilter | null | undefined) {
  return value?.conditions.length === 1 &&
    value.conditions[0]?.field === 'manual' &&
    value.conditions[0].operator === 'equals' &&
    value.conditions[0].value === MANUAL_CHILD_ORDER_FILTER_VALUE;
}
