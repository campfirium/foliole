#!/usr/bin/env node
/* global console, process */

import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { enforceJourneyReadiness } from '../journey-readiness-contract.mjs';
import { writeReceiptAtomically } from '../journey-readiness-cli.mjs';
import { runJourneyQualification } from '../journey-readiness-controller.mjs';
import { withArtifactBatch } from '../diagnostics/local-artifact-cache-production.mjs';
import {
  assertConfinedEvidencePath,
  collectLocalCandidate,
  createLocalDefinition,
  createMacProviders,
  prepareLocalCandidate
} from './journey-readiness-mac-adapter.mjs';
import { createSimulatorProviders } from './journey-readiness-simulator-adapter.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

function runId() {
  return new Date().toISOString().replaceAll(/[:.]/gu, '-');
}

async function qualify() {
  return withArtifactBatch({ entryName: 'journey-readiness', rootDir: REPO_ROOT }, async () => {
    const artifactDir = path.join(REPO_ROOT, '.tmp/artifacts/journey-readiness', runId());
    mkdirSync(artifactDir, { recursive: true });
    assertConfinedEvidencePath(REPO_ROOT, artifactDir);
    const candidate = prepareLocalCandidate(REPO_ROOT);
    const definition = createLocalDefinition({ artifactDir, candidate, repoRoot: REPO_ROOT });
    const providers = {
      ...createMacProviders({ artifactDir, candidate }),
      ...createSimulatorProviders({ artifactDir, repoRoot: REPO_ROOT })
    };
    const receiptPath = path.join(artifactDir, 'receipt.json');
    const receipt = await runJourneyQualification({
      definition, locator: receiptPath, providers, timeoutMs: 600_000,
      writeReceipt: (value) => writeReceiptAtomically(receiptPath, value)
    });
    const currentDefinition = createLocalDefinition({
      artifactDir, candidate: collectLocalCandidate(REPO_ROOT), repoRoot: REPO_ROOT
    });
    enforceJourneyReadiness(JSON.parse(readFileSync(receiptPath, 'utf8')), currentDefinition);
    console.log(JSON.stringify({ fingerprint: receipt.fingerprint, locator: receiptPath, status: receipt.status }));
    return receipt;
  });
}

qualify().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
