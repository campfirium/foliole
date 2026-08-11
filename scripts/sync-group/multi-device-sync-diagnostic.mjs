import { finalizeRun, recordReceipt } from './multi-device-sync-contract.mjs';
import { shortestStageChain } from './multi-device-sync-stage-catalog.mjs';
import { collectEnvironmentReadiness } from './multi-device-sync-readiness.mjs';

/* global structuredClone */

function stageFailure(stage, startedAt, error) {
  const completedAt = new Date().toISOString();
  const stalled = error.status === 'stalled' || error.result?.code === 124;
  return { completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    failureOwner: error.failureOwner || (stalled ? 'product' : 'controller'), host: error.host || stage.host,
    inputFacts: stage.inputs, lastProgressAt: error.lastProgressAt || startedAt,
    lastSuccessfulAction: error.lastSuccessfulAction || 'stage_started',
    missingFact: error.missingFact || (stalled ? 'observable_progress' : 'stage_action_failed'),
    outputFacts: [], stage: stage.name, startedAt, status: stalled ? 'stalled' : error.status || 'failed' };
}

function stagePassed(stage, startedAt, result) {
  const completedAt = new Date().toISOString();
  return { completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    evidenceRef: result.evidenceRef, failureOwner: 'product', host: stage.host,
    inputFacts: stage.inputs, lastProgressAt: result.lastProgressAt || completedAt,
    outputFacts: stage.outputs, progress: result.progress || [], stage: stage.name,
    startedAt, status: 'passed' };
}

export async function runDiagnostic({ adapters, availableFacts = [], candidateProvider,
  mutationAdapters = adapters, run, stageActions, targetStage }) {
  const readiness = await collectEnvironmentReadiness({ adapters });
  for (const receipt of readiness.receipts) recordReceipt(run, receipt);
  if (!readiness.allReady) return finalizeRun(run, await candidateProvider());
  for (const stage of shortestStageChain(targetStage, availableFacts)) {
    const action = stageActions[stage.action];
    if (typeof action !== 'function') {
      recordReceipt(run, stageFailure(stage, new Date().toISOString(), {
        failureOwner: 'controller', missingFact: 'unbound_stage', status: 'blocked'
      }));
      break;
    }
    const startedAt = new Date().toISOString();
    try {
      const result = await action({ run: structuredClone(run), stage });
      recordReceipt(run, stagePassed(stage, startedAt, result));
      if (stage.name === 'candidate-preparation') {
        const mutationReadiness = await collectEnvironmentReadiness({ adapters: mutationAdapters });
        for (const current of mutationReadiness.receipts) {
          recordReceipt(run, { ...current, inputFacts: ['candidate_bound'],
            stage: 'mutation-readiness' });
        }
        if (!mutationReadiness.allReady) break;
      }
    } catch (error) {
      recordReceipt(run, stageFailure(stage, startedAt, error));
      break;
    }
  }
  return finalizeRun(run, await candidateProvider());
}
