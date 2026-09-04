#!/usr/bin/env node
/* global console, process */

import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { enforceJourneyReadiness } from '../journey-readiness-contract.mjs';
import { writeReceiptAtomically } from '../journey-readiness-cli.mjs';
import { runJourneyQualification } from '../journey-readiness-controller.mjs';
import { withArtifactRun } from '../diagnostics/local-artifact-cache-production.mjs';
import { runIosDeviceAnchorAcceptance } from '../ios/ios-device-anchor-acceptance-runner.mjs';
import { runIosAcceptanceAttempts } from '../ios/ios-acceptance-attempts.mjs';
import { runIosBootstrapAcceptanceAttempt } from '../ios/ios-bootstrap-acceptance-attempt.mjs';
import { prepareIosAcceptanceCache } from '../ios/ios-local-storage.mjs';
import {
  assertConfinedEvidencePath, assertLocalCandidateStillFrozen, cleanupLocalSourceCapsule,
  createLocalDefinition,
  createMacProviders,
  materializeLocalSourceCapsule, prepareLocalCandidate
} from './journey-readiness-mac-adapter.mjs';
import { createSimulatorProviders } from './journey-readiness-simulator-adapter.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

function runId() {
  return new Date().toISOString().replaceAll(/[:.]/gu, '-');
}

export function resolveLocalQualificationScenario(env = process.env) {
  const scenario = env.FOLIOLE_JOURNEY_READINESS_SCENARIO?.trim();
  if (!scenario) return null;
  if (![
    'device-identity', 'sync-group-discovery-events', 'sync-group-join-runtime', 'sync-trigger-runtime'
  ].includes(scenario)) {
    throw new Error(`Unsupported local qualification scenario: ${scenario}`);
  }
  return scenario;
}

async function qualify() {
  const runName = runId();
  return withArtifactRun({
    categoryName: 'journey-readiness', rootDir: REPO_ROOT, runName
  }, async () => {
    const scenario = resolveLocalQualificationScenario();
    const artifactDir = path.join(REPO_ROOT, '.tmp/artifacts/journey-readiness', runName);
    mkdirSync(artifactDir, { recursive: true });
    assertConfinedEvidencePath(REPO_ROOT, artifactDir);
    const derivedData = prepareIosAcceptanceCache(REPO_ROOT).derivedData;
    const frozen = prepareLocalCandidate(REPO_ROOT);
    const capsule = materializeLocalSourceCapsule(REPO_ROOT, artifactDir, frozen);
    const candidate = capsule.candidate;
    const definition = createLocalDefinition({ candidate });
    const providers = {
      ...createMacProviders({ artifactDir, candidate, repoRoot: REPO_ROOT }),
      ...createSimulatorProviders({ artifactDir, derivedData, repoRoot: capsule.buildRoot,
        cleanupSource: () => cleanupLocalSourceCapsule(capsule) })
    };
    const receiptPath = path.join(artifactDir, 'receipt.json');
    const receipt = await runJourneyQualification({
      definition, locator: receiptPath, providers, timeoutMs: 600_000,
      writeReceipt: (value) => writeReceiptAtomically(receiptPath, value)
    });
    enforceJourneyReadiness(JSON.parse(readFileSync(receiptPath, 'utf8')), definition);
    if (scenario === 'device-identity') {
      await runIosDeviceAnchorAcceptance(REPO_ROOT, path.join(artifactDir, scenario));
    }
    if ([
      'sync-group-discovery-events', 'sync-group-join-runtime', 'sync-trigger-runtime'
    ].includes(scenario)) {
      const scenarioRoot = path.join(artifactDir, scenario);
      await runIosAcceptanceAttempts({
        artifactRoot: scenarioRoot,
        runAttempt: ({ artifactDir: attemptDir, attemptNumber }) =>
          runIosBootstrapAcceptanceAttempt(REPO_ROOT, scenario, attemptDir, attemptNumber)
      });
    }
    assertLocalCandidateStillFrozen(candidate, REPO_ROOT);
    console.log(JSON.stringify({ fingerprint: receipt.fingerprint, locator: receiptPath,
      scenario: scenario ?? 'readiness', status: receipt.status }));
    return receipt;
  });
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  qualify().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
