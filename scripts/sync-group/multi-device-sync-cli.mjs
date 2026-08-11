#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createRun } from './multi-device-sync-contract.mjs';
import { currentAcceptanceCandidate } from './multi-device-sync-candidate.mjs';
import { runDiagnostic } from './multi-device-sync-diagnostic.mjs';
import {
  createHostReadinessAdapters, createMutationReadinessAdapters
} from './multi-device-sync-host-readiness.mjs';
import {
  cleanupDiagnosticState, createDiagnosticStageActions
} from './multi-device-sync-stage-actions.mjs';
import {
  cleanupOwnedRun, createIsolatedMacosRoot
} from './multi-device-sync-workspace.mjs';

function parse(argv) {
  if (argv.length !== 3 || argv[0] !== 'diagnostic' || argv[1] !== '--stage') {
    throw new Error('usage: multi-device-sync-cli diagnostic --stage <registered-stage>');
  }
  return { mode: 'diagnostic', stage: argv[2] };
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

export async function runCli({ argv = process.argv.slice(2), repoRoot = process.cwd(),
  runId = identity() } = {}) {
  const request = parse(argv);
  const candidateProvider = async () => currentAcceptanceCandidate(repoRoot, request.mode);
  const candidate = await candidateProvider();
  createIsolatedMacosRoot({ repoRoot, runId });
  const options = { repoRoot, runId };
  const run = createRun({ candidate, mode: request.mode, runId, scenario: request.stage });
  const result = await runDiagnostic({ adapters: createHostReadinessAdapters(options),
    candidateProvider, mutationAdapters: createMutationReadinessAdapters(options), run,
    stageActions: createDiagnosticStageActions(options), targetStage: request.stage });
  const summaryPath = writeSummary(repoRoot, result);
  if (result.status === 'passed') {
    await cleanupDiagnosticState(options);
    cleanupOwnedRun(options);
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
