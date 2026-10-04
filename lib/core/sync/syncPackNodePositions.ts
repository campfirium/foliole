import type { DbPort } from './dbPort.js';
import { publishLocalNodePosition } from './nodeVersionMemberPositionPublish.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';

async function loadIncomingHeads(port: DbPort, incomingAlias: string) {
  return port.query<{ id: string }>(`SELECT id FROM ${incomingAlias}.nodes
    UNION SELECT node_id AS id FROM ${incomingAlias}.node_sync_tombstones`);
}

export async function collectAppliedNodeVersions(port: DbPort, incomingAlias: string) {
  const heads = await loadIncomingHeads(port, incomingAlias);
  for (const head of heads) await collectNodeVersionPayloads(port, head.id, Number.MAX_SAFE_INTEGER);
}

export async function publishAppliedNodePositions(port: DbPort, incomingAlias: string) {
  for (const row of await loadIncomingHeads(port, incomingAlias)) {
    await publishLocalNodePosition(port, row.id);
  }
}
