/* global console, process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assertSandboxEntitlements } from './distribution-contract.mjs';
import { createGithubBuilderConfig } from './package-github.mjs';
import { createMasBuilderConfig } from './package-mas.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

export async function runDistributionContractCheck() {
  const base = JSON.parse(await readFile(path.join(ROOT, 'electron/builder.json'), 'utf8'));
  const common = {
    codexPath: '.tmp/contract/codex',
    electronDist: path.join(ROOT, '.tmp/electron-mas-arm64'),
    provisioningProfile: '/profiles/contract.provisionprofile'
  };
  createGithubBuilderConfig(base, {
    ...common,
    notarize: false,
    outputDirectory: '/private/tmp/foliole-github-contract'
  });
  createMasBuilderConfig(base, {
    ...common,
    globalCaptureHelperPath: '.tmp/contract/Foliole Global Capture',
    mode: 'development',
    outputDirectory: '/private/tmp/foliole-mas-development-contract'
  });
  createMasBuilderConfig(base, {
    ...common,
    globalCaptureHelperPath: '.tmp/contract/Foliole Global Capture',
    mode: 'distribution',
    outputDirectory: '/private/tmp/foliole-mas-distribution-contract'
  });
  const entitlements = await readFile(path.join(ROOT, 'build/entitlements.mas.plist'), 'utf8');
  assertSandboxEntitlements(entitlements);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  runDistributionContractCheck().then(() => {
    console.log('[macos-distribution-contract] status: OK');
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
