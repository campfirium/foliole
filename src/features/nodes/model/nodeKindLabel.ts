import type { NodeKind } from '../../../../lib/core/nodes/nodeKind';

export function getNodeKindLabel(kind: NodeKind) {
  if (kind === 'folder') {
    return 'Folder';
  }
  if (kind === 'item') {
    return 'Item';
  }
  return 'Topic';
}
