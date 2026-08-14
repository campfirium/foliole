import { digest } from './multi-device-sync-contract.mjs';
import { resolveStage } from './multi-device-sync-stage-catalog.mjs';

/* global structuredClone */

const scenarios = [{
  name: 'a-offline-b-admits-c',
  stages: ['candidate-preparation', 'a-b-group-sync', 'b-admit-c']
}, {
  name: 'three-device-convergence',
  stages: ['candidate-preparation', 'a-b-group-sync', 'b-admit-c', 'a-rejoin']
}, {
  name: 'founder-leave-continuity',
  stages: ['candidate-preparation', 'a-b-group-sync', 'b-admit-c', 'a-rejoin', 'a-leave']
}, {
  name: 'participation-control-continuity',
  stages: ['candidate-preparation', 'a-b-group-sync', 'b-admit-c', 'a-rejoin',
    'participation-control']
}, {
  name: 'nonempty-library-convergence',
  stages: ['candidate-preparation', 'a-b-group-sync', 'a-b-convergence', 'b-admit-c', 'a-rejoin']
}, {
  name: 'sync-from-zero-continuity',
  stages: ['candidate-preparation', 'a-b-group-sync', 'sync-from-zero']
}];

function assertAcyclic(stages) {
  const visiting = new Set();
  const visited = new Set();
  const producers = new Map(stages.flatMap((stage) => stage.outputs.map((fact) => [fact, stage.name])));
  function visit(stage) {
    if (visiting.has(stage.name)) throw new Error(`Cyclic scenario stage: ${stage.name}`);
    if (visited.has(stage.name)) return;
    visiting.add(stage.name);
    for (const fact of stage.inputs) {
      const producer = producers.get(fact);
      if (producer) visit(stages.find(({ name }) => name === producer));
    }
    visiting.delete(stage.name); visited.add(stage.name);
  }
  stages.forEach(visit);
}

export function assertScenarioTopology(scenario, resolver = resolveStage) {
  const available = new Set();
  const names = new Set();
  const stages = (scenario?.stages ?? []).map(resolver);
  assertAcyclic(stages);
  for (const stage of stages) {
    const name = stage.name;
    if (names.has(name)) throw new Error(`Duplicate scenario stage: ${name}`);
    names.add(name);
    const missing = stage.inputs.find((fact) => !available.has(fact));
    if (missing) throw new Error(`Incomplete scenario input: ${name} requires ${missing}`);
    stage.outputs.forEach((fact) => available.add(fact));
  }
  if (names.size === 0) throw new Error('Multi-device sync scenario is empty.');
  return scenario;
}

export function scenarioCatalog() {
  return structuredClone(scenarios);
}

export function scenarioCatalogDigest() {
  return digest(scenarios);
}

export function resolveScenario(name) {
  const scenario = scenarios.find((entry) => entry.name === name);
  if (!scenario) throw new Error(`Unknown multi-device sync scenario: ${name}`);
  assertScenarioTopology(scenario);
  return structuredClone(scenario);
}
