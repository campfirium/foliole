import { z } from 'zod';

import { replaceNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';

const inputSchema = z.object({ count: z.number().int().positive().max(10000),
  kind: z.enum(['topics', 'items']) });
const parentId = (kind: string, index: number) => `t340-${kind}-parent-${index}`;
const childId = (kind: string, index: number) => `t340-${kind}-child-${index}`;

export function seedParentOrderPerformance(input: unknown) {
  const { count, kind } = inputSchema.parse(input);
  const now = '2026-10-11T00:00:00.000Z';
  const { sqlite } = openDatabaseConnection();
  sqlite.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      if (index % 100 === 0) upsertNodeSnapshot({ anchorLink: null, content: '',
        createdAt: now, updatedAt: now, isTitleManual: true,
        kind: kind === 'topics' ? 'folder' : 'topic', nodeId: parentId(kind, index / 100),
        parentNodeId: null, position: 0, reveal: null, title: `Parent ${index / 100}` });
      upsertNodeSnapshot({ anchorLink: null, content: `Body ${index}`, createdAt: now,
        updatedAt: now, isTitleManual: true, kind: kind === 'topics' ? 'topic' : 'item',
        nodeId: childId(kind, index), parentNodeId: parentId(kind, Math.floor(index / 100)),
        position: index % 100, reveal: null, title: `Child ${index}` });
    }
    flushDirtyNodeSyncVersions();
  })();
  return { count, kind };
}

export function editParentOrderPerformance(input: unknown) {
  const { kind, count, workload } = inputSchema.extend({ workload: z.enum(['single', 'many']) }).parse(input);
  const { driver } = openDatabaseConnection();
  const parentCount = workload === 'single' ? 1 : Math.ceil(count / 100);
  const savedEdits = workload === 'single' ? 1 : 5;
  for (let edit = 0; edit < savedEdits; edit += 1) {
    const ids: string[] = [];
    for (let parent = 0; parent < parentCount; parent += 1) {
      const row = driver.queryOne<{ child_ids_json: string }>(
        'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', [parentId(kind, parent)]);
      if (!row) throw new Error('fixture_order_missing');
      const order = z.array(z.string()).parse(JSON.parse(row.child_ids_json));
      if (order.length < 2) throw new Error('fixture_order_too_small');
      [order[0], order[1]] = [order[1]!, order[0]!];
      ids.push(...order);
    }
    replaceNodeOrder(driver, ids);
  }
  return { parentCount, savedEdits };
}
