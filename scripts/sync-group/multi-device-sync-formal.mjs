import { runStageSequence } from './multi-device-sync-diagnostic.mjs';
import { resolveScenario } from './multi-device-sync-scenario-catalog.mjs';
import { resolveStage } from './multi-device-sync-stage-catalog.mjs';

export async function runFormal(options) {
  const scenario = resolveScenario(options.run.scenario);
  return runStageSequence({
    ...options,
    stages: scenario.stages.map(resolveStage)
  });
}
