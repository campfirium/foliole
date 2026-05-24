import { normalizeManualChildOrder } from '../../../../lib/core/nodes/manualChildOrder';

import type { Node } from './nodeTypes';

export { normalizeManualChildOrder };

export function updateFolderManualChildOrder(
  folder: Node,
  manualChildOrder: readonly string[] | null | undefined,
  updatedAt: string
): Node {
  const normalized = normalizeManualChildOrder(manualChildOrder);
  const currentKey = JSON.stringify(normalizeManualChildOrder(folder.manualChildOrder) ?? []);
  const nextKey = JSON.stringify(normalized ?? []);
  if (currentKey === nextKey) {
    return folder;
  }
  return {
    ...folder,
    ...(normalized ? { manualChildOrder: normalized } : { manualChildOrder: null }),
    updatedAt
  };
}
