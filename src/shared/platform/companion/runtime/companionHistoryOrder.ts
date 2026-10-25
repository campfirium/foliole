import { ROOT_CHILD_ORDER_ID } from '../../../../../lib/core/database/parentChildOrder';
import { projectCurrentParentOrderWithDbPort, saveLocalCurrentParentOrderWithDbPort } from '../../../../../lib/core/sync/currentParentOrderStore';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { WorkspaceNodeMetadataHistoryEntry } from '../../../../store/workspaceNodeMetadataHistory';

type Order = WorkspaceNodeMetadataHistoryEntry['orders'][number];
export async function captureCompanionHistoryOrders(db: DbPort, parentIds: (string | null)[]) {
  const result: Order[] = [];
  for (const parentId of new Set(parentIds.map(id => id ?? ROOT_CHILD_ORDER_ID))) {
    const before = await projectCurrentParentOrderWithDbPort(db, parentId, new Date().toISOString());
    result.push({ parentId, before, after: [] });
  }
  return result;
}

export async function completeCompanionHistoryOrders(db: DbPort, orders: Order[]) {
  return Promise.all(orders.map(async order => ({ ...order,
    after: await projectCurrentParentOrderWithDbPort(db, order.parentId, new Date().toISOString()) })));
}

export async function validateCompanionHistoryOrders(db: DbPort, orders: Order[], mode: 'undo' | 'redo') {
  for (const order of orders) {
    const current = await projectCurrentParentOrderWithDbPort(db, order.parentId, new Date().toISOString());
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
