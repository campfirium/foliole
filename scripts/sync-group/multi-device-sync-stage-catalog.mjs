import { digest } from './multi-device-sync-contract.mjs';

/* global structuredClone */

const CONTROL_DEADLINE = 10_000;
const PRODUCT_PROGRESS_DEADLINE = 60_000;
const WINDOWS_C_JOIN_DEADLINE = 15 * 60_000;

const stages = [
  { action: 'prepare-candidate', hardDeadlineMs: 30 * 60_000, host: 'all', inputs: [],
    milestones: ['candidate-prepared'], name: 'candidate-preparation', hosts: [],
    outputs: ['candidate_bound'], progressDeadlineMs: 20 * 60_000, siblings: [] },
  { action: 'establish-a-b', host: 'all', inputs: ['candidate_bound'], name: 'a-b-group-sync',
    hardDeadlineMs: 10 * 60_000, hosts: ['macos-a', 'android-b'],
    milestones: ['a5-cleared', 'macos-group-created', 'a5-paired', 'a-b-synced'],
    outputs: ['a_b_group_active'], progressDeadlineMs: PRODUCT_PROGRESS_DEADLINE, siblings: [] },
  { action: 'prove-a-b-convergence', host: 'all', inputs: ['a_b_group_active'],
    hardDeadlineMs: 8 * 60_000, hosts: ['macos-a', 'android-b'], name: 'a-b-convergence',
    milestones: ['a-fact-synced-to-b', 'b-fact-synced-to-a', 'a-b-restarted',
      'a-b-bidirectional-converged'], outputs: ['a_b_bidirectional_converged'],
    progressDeadlineMs: PRODUCT_PROGRESS_DEADLINE, siblings: [] },
  { action: 'admit-empty-c', host: 'all', inputs: ['a_b_group_active'], name: 'b-admit-empty-c',
    hardDeadlineMs: 20 * 60_000, hosts: ['macos-a', 'android-b', 'windows-c'],
    milestones: ['a-listener-ready', 'a-fact-created', 'b-provider-stopped', 'b-transport-ready',
      'b-fact-received', 'a-offline', 'c-join-started', 'b-approval-completed',
      'c-ordinary-sync-completed'], outputs: ['b_c_group_active'],
    progressDeadlineMs: WINDOWS_C_JOIN_DEADLINE + CONTROL_DEADLINE,
    siblings: [{ hardDeadlineMs: WINDOWS_C_JOIN_DEADLINE + CONTROL_DEADLINE,
      name: 'android-b-approval', waitsFor: 'windows-c-join' },
      { hardDeadlineMs: WINDOWS_C_JOIN_DEADLINE, name: 'windows-c-join', waitsFor: null }] },
  { action: 'rejoin-a', host: 'all', inputs: ['b_c_group_active'], name: 'a-rejoin',
    hardDeadlineMs: 20 * 60_000, hosts: ['macos-a', 'android-b', 'windows-c'],
    milestones: ['a-listener-ready', 'three-members-converged', 'a-fact-created',
      'b-fact-created', 'c-fact-created', 'three-facts-converged', 'three-members-restarted'],
    outputs: ['three_members_active'],
    progressDeadlineMs: PRODUCT_PROGRESS_DEADLINE + CONTROL_DEADLINE, siblings: [] },
  { action: 'leave-a', host: 'macos-a', inputs: ['three_members_active'], name: 'a-leave',
    hardDeadlineMs: 20 * 60_000, hosts: ['macos-a', 'android-b', 'windows-c'],
    milestones: ['survivor-provider-ready', 'a-left', 'a-restarted-unbound',
      'b-two-members-active', 'b-fact-created', 'c-fact-created',
      'survivor-facts-converged', 'survivors-restarted', 'former-a-revoked'],
    outputs: ['b_c_survivors_active'],
    progressDeadlineMs: PRODUCT_PROGRESS_DEADLINE + CONTROL_DEADLINE, siblings: [] },
  { action: 'set-participation', host: 'all', inputs: ['three_members_active'], name: 'participation-control',
    hardDeadlineMs: 20 * 60_000, hosts: ['macos-a', 'android-b', 'windows-c'], milestones: [],
    outputs: ['participation_converged'], progressDeadlineMs: PRODUCT_PROGRESS_DEADLINE, siblings: [] },
  { action: 'sync-from-zero', host: 'all', inputs: ['a_b_group_active'], name: 'sync-from-zero',
    hardDeadlineMs: 20 * 60_000, hosts: ['macos-a', 'android-b', 'windows-c'], milestones: [],
    outputs: ['fresh_client_converged'], progressDeadlineMs: PRODUCT_PROGRESS_DEADLINE, siblings: [] }
];

export function assertStageTiming(stage) {
  if (!Number.isFinite(stage.hardDeadlineMs) || !Number.isFinite(stage.progressDeadlineMs)
      || stage.hardDeadlineMs <= stage.progressDeadlineMs) {
    throw new Error(`Invalid stage deadlines: ${stage.name}`);
  }
  for (const sibling of stage.siblings) {
    const waited = stage.siblings.find(({ name }) => name === sibling.waitsFor);
    if (sibling.waitsFor && !waited) throw new Error(`Unknown sibling wait: ${sibling.waitsFor}`);
    if (waited && sibling.hardDeadlineMs < waited.hardDeadlineMs + CONTROL_DEADLINE) {
      throw new Error(`Sibling wait deadline is too short: ${sibling.name}`);
    }
  }
  const siblingWindow = Math.max(0, ...stage.siblings.map(({ hardDeadlineMs }) => hardDeadlineMs));
  if (stage.siblings.length > 0 && stage.progressDeadlineMs < siblingWindow) {
    throw new Error(`Stage progress deadline is shorter than its sibling window: ${stage.name}`);
  }
  if (stage.siblings.length > 0 && stage.hardDeadlineMs < siblingWindow + CONTROL_DEADLINE) {
    throw new Error(`Stage sibling settlement deadline is too short: ${stage.name}`);
  }
  return stage;
}

export function stageCatalog() {
  return structuredClone(stages);
}

export function stageCatalogDigest() {
  return digest(stages);
}

export function resolveStage(name) {
  const stage = stages.find((entry) => entry.name === name);
  if (!stage) throw new Error(`Unknown multi-device sync stage: ${name}`);
  return structuredClone(assertStageTiming(stage));
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

export function stageHostClosure(selectedStages) {
  return [...new Set(selectedStages.flatMap(({ hosts = [] }) => hosts))];
}
