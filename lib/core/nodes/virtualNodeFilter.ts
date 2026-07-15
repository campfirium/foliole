export const VIRTUAL_NODE_FILTER_VERSION = 1;

export type VirtualNodeFilterMatchMode = 'all';
export type VirtualNodeFilterConditionField = 'collection' | 'text';
export type VirtualNodeFilterConditionOperator = 'contains' | 'equals';

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
      (condition.field === 'collection' && condition.operator === 'equals')) &&
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
