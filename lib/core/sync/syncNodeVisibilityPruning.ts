import { VISIBLE_NODES_CTE_SQL } from '../database/workspaceVisibleNodesSql.js';

import type { DbPort } from './dbPort.js';

export async function pruneLearningRowsWithoutVisibleNodes(port: DbPort) {
  await port.run(
    `${VISIBLE_NODES_CTE_SQL}
     DELETE FROM node_reading_host_state
     WHERE node_id NOT IN (SELECT id FROM visible_nodes)`
  );
  await port.run(
    `${VISIBLE_NODES_CTE_SQL}
     DELETE FROM node_reading
     WHERE node_id NOT IN (SELECT id FROM visible_nodes)`
  );
  await port.run(
    `${VISIBLE_NODES_CTE_SQL}
     DELETE FROM node_review
     WHERE node_id NOT IN (SELECT id FROM visible_nodes)`
  );
}
