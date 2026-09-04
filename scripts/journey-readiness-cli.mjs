#!/usr/bin/env node
/* global console, process */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { enforceJourneyReadiness } from './journey-readiness-contract.mjs';
import { runJourneyQualification } from './journey-readiness-controller.mjs';
import { createPassingProviders, localFixtureDefinition } from './journey-readiness-fixture.mjs';
import { withArtifactRun } from './diagnostics/local-artifact-cache-production.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function confinedReceiptPath(rawPath) {
  const allowed = path.join(REPO_ROOT, '.tmp/artifacts/journey-readiness');
  const receiptPath = path.resolve(REPO_ROOT, rawPath);
  const relative = path.relative(allowed, receiptPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Dry-run receipt must be beneath .tmp/artifacts/journey-readiness.');
  }
  return receiptPath;
}

export function writeReceiptAtomically(receiptPath, receipt) {
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  const temporaryPath = `${receiptPath}.writing`;
  writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, receiptPath);
  return receiptPath;
}

export function readAndEnforceReceipt(receiptPath, definition) {
  return enforceJourneyReadiness(JSON.parse(readFileSync(receiptPath, 'utf8')), definition);
}

async function main() {
  const outputIndex = process.argv.indexOf('--output');
  const receiptPath = confinedReceiptPath(
    process.argv[outputIndex + 1] ?? '.tmp/artifacts/journey-readiness/dry-run/receipt.json'
  );
  const runName = path.relative(
    path.join(REPO_ROOT, '.tmp/artifacts/journey-readiness'), receiptPath
  ).split(path.sep)[0];
  await withArtifactRun({
    categoryName: 'journey-readiness', rootDir: REPO_ROOT, runName
  }, async () => {
    const definition = localFixtureDefinition();
    const receipt = await runJourneyQualification({
      definition, locator: receiptPath, providers: createPassingProviders(),
      writeReceipt: (value) => writeReceiptAtomically(receiptPath, value)
    });
    readAndEnforceReceipt(receiptPath, definition);
    console.log(JSON.stringify({ fingerprint: receipt.fingerprint, locator: receipt.locator, status: receipt.status }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/journey-readiness-cli.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
