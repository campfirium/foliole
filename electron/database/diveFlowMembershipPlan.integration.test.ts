// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { captureMoveReadingScope } from '../../lib/core/database/nodeMoveReadingContext.js';
import { readDiveFlowMembers } from '../../lib/core/flow/diveFlowMembership.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';

import { addNode, setup } from './diveDailyFlow.testSupport.js';
import { closeLibraries } from './syncLibrary.testSupport.js';

afterEach(closeLibraries);

it('walks Dive members through the parent index instead of rereading the library per member', async () => {
  const { peer, scope } = await setup('topic');
  addNode(peer, 'child', 0, 'item', 'a');
  const plan: string[] = [];
  const port = {
    ...peer.port,
    query<T extends DbRow>(sql: string, params: unknown[] = []) {
      if (sql.includes('RECURSIVE')) {
        const rows = peer.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[];
        plan.push(...rows.map(row => row.detail));
      }
      return peer.port.query<T>(sql, params as never);
    }
  } as DbPort;

  expect(await readDiveFlowMembers(port, scope(['a']).id)).toEqual(['a', 'child']);
  expect(plan.some(detail => detail.includes('idx_nodes_parent_id'))).toBe(true);
  expect(plan.filter(detail => detail.includes('idx_nodes_deleted_at'))).toEqual([]);
});

it('walks a moved subtree through the parent index', async () => {
  const { peer } = await setup('topic');
  addNode(peer, 'child', 0, 'item', 'a');
  const plan: string[] = [];
  const driver = {
    ...peer.driver,
    queryAll(sql: string, params: unknown[] = []) {
      if (sql.includes('subtree') || sql.includes('node_reading_host_state h')) {
        const rows = peer.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[];
        plan.push(...rows.map(row => row.detail));
      }
      return peer.driver.queryAll(sql, params as never);
    }
  } as DatabaseDriver;

  const result = captureMoveReadingScope(driver, { nodes: [{ nodeId: 'a', parentNodeId: null }] });
  expect([...result.descendantIds].sort()).toEqual(['a', 'child']);
  expect(plan.some(detail => detail.includes('idx_nodes_parent_id'))).toBe(true);
  expect(plan.filter(detail => detail.includes('idx_nodes_deleted_at'))).toEqual([]);
});
