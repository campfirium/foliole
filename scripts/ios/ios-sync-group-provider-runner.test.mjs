// @vitest-environment node
/* global process */
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { compileSyncGroupProvider } from './ios-sync-group-provider-runner.mjs';

it('compiles the request provider and its runtime dependencies', () => {
  const outputDirectory = '.tmp/artifacts/ios-sync-group-provider-distribution-test';
  fs.rmSync(outputDirectory, { force: true, recursive: true });
  try {
    compileSyncGroupProvider(process.cwd(), outputDirectory);
    const distributionRoot = path.join(outputDirectory, 'service-dist');
    expect(fs.existsSync(path.join(
      distributionRoot, 'scripts/ios/ios-sync-group-provider-fixture.js'
    ))).toBe(true);
    expect(fs.existsSync(path.join(distributionRoot, 'scripts/ios/ios-hosted-state-writeback-facts.mjs'))).toBe(true);

  } finally {
    fs.rmSync(outputDirectory, { force: true, recursive: true });
  }
}, 30_000);
