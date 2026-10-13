import { reconcileCurrentNodeBody } from './currentNodeBodyProjection.js';
import type { DbPort } from './dbPort.js';

/** Apply each selected complete version to its clean current business record in the pack transaction. */
export async function reconcileSyncPackInlineBodies(port: DbPort, incomingAlias: string,
  enqueueSearchInvalidations: boolean) {
  const alias = `"${incomingAlias.replaceAll('"', '""')}"`;
  let after = '';
  for (;;) {
    const [row] = await port.query<{ id: string }>(
      `SELECT n.id FROM main.nodes n WHERE n.id > ? AND n.id IN (SELECT id FROM ${alias}.nodes)
       ORDER BY n.id LIMIT 1`, [after]);
    if (!row) return;
    after = row.id;
    await reconcileCurrentNodeBody(port, row.id, enqueueSearchInvalidations);
  }
}
