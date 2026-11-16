import { VIRTUAL_ROOT_NODE_ID } from '../database/specialNodeIds.js';

import { DIVE_NODE_FILTER, readDiveNode } from './dive.js';
import { createManualVirtualNodeFilter } from './virtualNodeFilter.js';

type Directory = NonNullable<Parameters<typeof readDiveNode>[0]> & { deletedAt?: string | null };

export type DiveDirectoryConversionTarget = 'dive' | 'index';

export function resolveDiveDirectoryConversionTarget(node: Directory | undefined): DiveDirectoryConversionTarget | null {
  if (!node || node.deletedAt || node.kind !== 'folder') return null;
  if (readDiveNode(node)) return 'index';
  if (node.parentNodeId === VIRTUAL_ROOT_NODE_ID && node.virtualFilter) return 'dive';
  return null;
}

export function diveDirectoryConversionFields(target: DiveDirectoryConversionTarget) {
  return target === 'dive'
    ? { parentNodeId: null, virtualFilter: DIVE_NODE_FILTER }
    : { parentNodeId: VIRTUAL_ROOT_NODE_ID, virtualFilter: createManualVirtualNodeFilter() };
}
