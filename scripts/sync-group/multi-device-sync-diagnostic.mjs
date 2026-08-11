import { finalizeRun, recordReceipt } from './multi-device-sync-contract.mjs';
import { shortestStageChain } from './multi-device-sync-stage-catalog.mjs';
import { collectEnvironmentReadiness } from './multi-device-sync-readiness.mjs';

/* global structuredClone */

function stageFailure(stage, startedAt, error) {
  const completedAt = new Date().toISOString();
  const stalled = error.status === 'stalled' || error.result?.code === 124;
  return { completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    ...(error.evidenceRef ? { evidenceRef: error.evidenceRef } : {}),
    ...(error.message ? { failureDetail: String(error.message).replace(/[\r\n]+/gu, ' ').slice(0, 500) } : {}),
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

export async function runStageSequence({ adapters, candidateProvider,
  mutationAdapters = adapters, onReceipt = () => {}, readinessHosts, run, stageActions, stages }) {
  const readiness = await collectEnvironmentReadiness({ adapters, hosts: readinessHosts });
  for (const receipt of readiness.receipts) {
    recordReceipt(run, receipt); onReceipt(receipt);
  }
  if (!readiness.allReady) return finalizeRun(run, await candidateProvider());
  for (const stage of stages) {
    const action = stageActions[stage.action];
    if (typeof action !== 'function') {
      const receipt = stageFailure(stage, new Date().toISOString(), {
        failureOwner: 'controller', missingFact: 'unbound_stage', status: 'blocked'
      });
      recordReceipt(run, receipt); onReceipt(receipt);
      break;
    }
    const startedAt = new Date().toISOString();
    try {
      const result = await action({ run: structuredClone(run), stage });
      const receipt = stagePassed(stage, startedAt, result);
      recordReceipt(run, receipt); onReceipt(receipt);
      if (stage.name === 'candidate-preparation') {
        const mutationReadiness = await collectEnvironmentReadiness({
          adapters: mutationAdapters, hosts: readinessHosts
        });
        for (const current of mutationReadiness.receipts) {
          const receipt = { ...current, inputFacts: ['candidate_bound'],
            stage: 'mutation-readiness' };
          recordReceipt(run, receipt); onReceipt(receipt);
        }
        if (!mutationReadiness.allReady) break;
      }
    } catch (error) {
      const receipt = stageFailure(stage, startedAt, error);
      recordReceipt(run, receipt); onReceipt(receipt);
      break;
    }
  }
  return finalizeRun(run, await candidateProvider());
}

export async function runDiagnostic({ availableFacts = [], targetStage, ...options }) {
  return runStageSequence({
    ...options, stages: shortestStageChain(targetStage, availableFacts)
  });
}
