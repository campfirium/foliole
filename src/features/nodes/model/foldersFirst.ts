import type { NodeKind } from '../../../../lib/core/nodes/nodeKind';

export function placeFoldersFirst<T extends { kind?: NodeKind }>(nodes: T[]): T[] {
  return [
    ...nodes.filter((node) => node.kind === 'folder'),
    ...nodes.filter((node) => node.kind !== 'folder')
  ];
}
