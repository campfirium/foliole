import { digest } from './multi-device-sync-contract.mjs';

/* global structuredClone */

const stages = [
  { action: 'prepare-candidate', host: 'all', inputs: [], name: 'candidate-preparation',
    outputs: ['candidate_bound'] },
  { action: 'establish-a-b', host: 'all', inputs: ['candidate_bound'], name: 'a-b-group-sync',
    outputs: ['a_b_group_active'] },
  { action: 'admit-empty-c', host: 'all', inputs: ['a_b_group_active'], name: 'b-admit-empty-c',
    outputs: ['b_c_group_active'] },
  { action: 'rejoin-a', host: 'all', inputs: ['b_c_group_active'], name: 'a-rejoin',
    outputs: ['three_members_active'] },
  { action: 'leave-a', host: 'macos-a', inputs: ['three_members_active'], name: 'a-leave',
    outputs: ['b_c_survivors_active'] },
  { action: 'set-participation', host: 'all', inputs: ['three_members_active'], name: 'participation-control',
    outputs: ['participation_converged'] },
  { action: 'sync-from-zero', host: 'all', inputs: ['a_b_group_active'], name: 'sync-from-zero',
    outputs: ['fresh_client_converged'] }
];

export function stageCatalog() {
  return structuredClone(stages);
}

export function stageCatalogDigest() {
  return digest(stages);
}

export function resolveStage(name) {
  const stage = stages.find((entry) => entry.name === name);
  if (!stage) throw new Error(`Unknown multi-device sync stage: ${name}`);
  return structuredClone(stage);
}

export function shortestStageChain(name, availableFacts = []) {
  const available = new Set(availableFacts);
  const result = [];
  const visiting = new Set();
  function visit(stageName) {
    if (visiting.has(stageName)) throw new Error(`Cyclic stage dependency: ${stageName}`);
    const stage = resolveStage(stageName);
    if (stage.outputs.every((fact) => available.has(fact))) return;
    visiting.add(stageName);
    for (const fact of stage.inputs) {
      if (available.has(fact)) continue;
      const producer = stages.find((entry) => entry.outputs.includes(fact));
      if (!producer) throw new Error(`Unbound stage input: ${fact}`);
      visit(producer.name);
    }
    visiting.delete(stageName);
    result.push(stage);
    stage.outputs.forEach((fact) => available.add(fact));
  }
  visit(name);
  return result;
}
