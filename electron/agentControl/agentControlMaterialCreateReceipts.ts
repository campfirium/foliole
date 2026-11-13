import { createHash } from 'node:crypto';

import { openDatabaseConnection } from '../database/connection.js';

import { AgentMaterialMutationError } from './agentControlMaterialMutations.js';
import { readAgentControlMaterial, type AgentMaterialReadPayload } from './agentControlMaterials.js';

interface CreateReceipt {
  fingerprint: string;
  materialId: string;
}

export function createMaterialWithReceipt(
  requestId: string,
  normalizedInput: unknown,
  create: () => AgentMaterialReadPayload
) {
  const { driver, sqlite } = openDatabaseConnection();
  const key = `agent_control:materials.create:${sha256(requestId)}`;
  const fingerprint = sha256(JSON.stringify(normalizedInput));
  return sqlite.transaction(() => {
    const row = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [key]);
    if (row) {
      const receipt = JSON.parse(row.value) as CreateReceipt;
      if (receipt.fingerprint !== fingerprint) throw new AgentMaterialMutationError('request_id_conflict', 409);
      const material = readAgentControlMaterial(receipt.materialId) ?? { id: receipt.materialId };
      return { material, replayed: true };
    }
    const material = create();
    const receipt: CreateReceipt = { fingerprint, materialId: material.id };
    driver.execute('INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)',
      [key, JSON.stringify(receipt), material.updated_at]);
    return { material, replayed: false };
  }).immediate();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
