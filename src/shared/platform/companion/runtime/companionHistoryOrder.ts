import { ROOT_CHILD_ORDER_ID } from '../../../../../lib/core/database/parentChildOrder';
import { readCurrentParentOrderWithDbPort, saveLocalCurrentParentOrderWithDbPort } from '../../../../../lib/core/sync/currentParentOrderStore';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { WorkspaceNodeMetadataHistoryEntry } from '../../../../store/workspaceNodeMetadataHistory';

type Order = WorkspaceNodeMetadataHistoryEntry['orders'][number];
export async function captureCompanionHistoryOrders(db: DbPort, parentIds: (string | null)[]) {
  const result: Order[] = [];
  for (const parentId of new Set(parentIds.map(id => id ?? ROOT_CHILD_ORDER_ID))) {
    const before = await readCurrentParentOrderWithDbPort(db, parentId);
    result.push({ parentId, before, after: [] });
  }
  return result;
}

export async function completeCompanionHistoryOrders(db: DbPort, orders: Order[]) {
  const completed: Order[] = [];
  for (const order of orders) {
    completed.push({ ...order, after: await readCurrentParentOrderWithDbPort(db, order.parentId) });
  }
  return completed;
}

export async function validateCompanionHistoryOrders(db: DbPort, orders: Order[], mode: 'undo' | 'redo') {
  for (const order of orders) {
    const current = await readCurrentParentOrderWithDbPort(db, order.parentId);
    if (JSON.stringify(current) !== JSON.stringify(mode === 'undo' ? order.after : order.before)) {
      throw new Error('workspace_history_order_changed');
    }
  }
}

export async function applyCompanionHistoryOrders(db: DbPort, orders: Order[], mode: 'undo' | 'redo', hostName: string) {
  for (const order of orders) await saveLocalCurrentParentOrderWithDbPort(db, {
    parentId: order.parentId, childIds: mode === 'undo' ? order.before : order.after, hostName, now: new Date().toISOString()
  });
}
