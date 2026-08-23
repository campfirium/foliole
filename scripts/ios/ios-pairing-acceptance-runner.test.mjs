// @vitest-environment node
/* global process */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { compilePairingAcceptanceService } from './ios-pairing-acceptance-runner.mjs';

const RELATIVE_ROOT = 'scripts/ios/fixtures/acceptance-contract-corpus';

it('copies the immutable acceptance corpus beside the compiled service', () => {
  const outputDirectory = '.tmp/artifacts/ios-pairing-service-distribution-test';
  fs.rmSync(outputDirectory, { force: true, recursive: true });
  try {
    compilePairingAcceptanceService(process.cwd(), outputDirectory);
    const sourceIdentity = readIdentity(RELATIVE_ROOT);
    const distributionRoot = path.join(outputDirectory, 'service-dist');
    const copiedRoot = path.join(distributionRoot, RELATIVE_ROOT);
    expect(fs.existsSync(path.join(
      distributionRoot, 'scripts/ios/ios-pairing-acceptance-service.js'
    ))).toBe(true);
    expect(readIdentity(copiedRoot)).toEqual(sourceIdentity);
    for (const [relativePath, expectedHash] of Object.entries(sourceIdentity.files)) {
      expect(hash(path.join(copiedRoot, relativePath))).toBe(expectedHash);
    }
  } finally {
    fs.rmSync(outputDirectory, { force: true, recursive: true });
  }
});

function readIdentity(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'corpus.json'), 'utf8'));
}

function hash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
