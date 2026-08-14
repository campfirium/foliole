#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createRun } from './multi-device-sync-contract.mjs';
import { currentAcceptanceCandidate } from './multi-device-sync-candidate.mjs';
import { runDiagnostic } from './multi-device-sync-diagnostic.mjs';
import { runFormal } from './multi-device-sync-formal.mjs';
import {
  createHostReadinessAdapters, createMutationReadinessAdapters
} from './multi-device-sync-host-readiness.mjs';
import {
  cleanupDiagnosticState, createDiagnosticStageActions
} from './multi-device-sync-stage-actions.mjs';
import { resolveScenario } from './multi-device-sync-scenario-catalog.mjs';
import {
  resolveStage, shortestStageChain, stageHostClosure
} from './multi-device-sync-stage-catalog.mjs';
import {
  cleanupOwnedRun, cleanupPreviousOwnedRuns, createIsolatedMacosRoot
} from './multi-device-sync-workspace.mjs';

function parse(argv) {
  const sourceIndex = argv.indexOf('--source-ref');
  const sourceRef = sourceIndex < 0 ? undefined : argv[sourceIndex + 1];
  const args = sourceIndex < 0 ? [...argv] : argv.toSpliced(sourceIndex, 2);
  if (args.length !== 3 || !['diagnostic', 'formal'].includes(args[0])
      || args[1] !== (args[0] === 'formal' ? '--scenario' : '--stage')
      || (sourceIndex >= 0 && !sourceRef)) {
    throw new Error('usage: multi-device-sync-cli <diagnostic --stage|formal --scenario> <name> [--source-ref refs/heads/<branch>]');
  }
  return { mode: args[0], sourceRef, target: args[2] };
}

function identity() {
  return `${new Date().toISOString().replace(/\D/gu, '').slice(0, 17)}-multi-device-sync`;
}

function writeSummary(repoRoot, run) {
  const root = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'summaries');
  fs.mkdirSync(root, { recursive: true });
  const summaryPath = path.join(root, `${run.runId}.json`);
  fs.writeFileSync(summaryPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  return summaryPath;
}

export async function cleanupPassedState({ mode, options,
  clearHosts = cleanupDiagnosticState, removeRun = cleanupOwnedRun }) {
  await clearHosts(options);
  if (mode === 'diagnostic') removeRun(options);
}

export async function runCli({ argv = process.argv.slice(2), repoRoot = process.cwd(),
  runId = identity() } = {}) {
  const request = parse(argv);
  const candidateProvider = async () => currentAcceptanceCandidate(
    repoRoot, request.mode, request.sourceRef
  );
  const candidate = await candidateProvider();
  cleanupPreviousOwnedRuns({ repoRoot, runId });
  createIsolatedMacosRoot({ repoRoot, runId });
  const selectedStages = request.mode === 'formal'
    ? resolveScenario(request.target).stages.map(resolveStage)
    : shortestStageChain(request.target);
  const options = { candidateProvider, repoRoot, requiredHosts: stageHostClosure(selectedStages), runId,
    sourceRef: candidate.sourceRef };
  const run = createRun({ candidate, mode: request.mode, runId, scenario: request.target });
  const runner = request.mode === 'formal' ? runFormal : runDiagnostic;
  const result = await runner({ adapters: createHostReadinessAdapters(options),
    candidateProvider, mutationAdapters: createMutationReadinessAdapters(options), run,
    onReceipt: (receipt) => console.log(`[multi-device-sync] stage=${receipt.stage} status=${receipt.status}`),
    readinessHosts: options.requiredHosts,
    stageActions: createDiagnosticStageActions(options), targetStage: request.target });
  const summaryPath = writeSummary(repoRoot, result);
  if (result.status === 'passed') {
    await cleanupPassedState({ mode: request.mode, options });
  }
  return { result, summaryPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().then(({ result, summaryPath }) => {
    console.log(`[multi-device-sync] status=${result.status} summary=${summaryPath}`);
    if (result.status !== 'passed') process.exitCode = 1;
  }).catch((error) => {
    console.error(`[multi-device-sync] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
