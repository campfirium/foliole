#!/usr/bin/env node
/* global console, process */

import path from 'node:path';

import { runIosSyncGroupLifecycleAcceptance } from
  '../ios/ios-sync-group-lifecycle-acceptance-runner.mjs';
import { withIosAcceptanceArtifacts } from '../ios/ios-local-storage.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const ARTIFACT_DIR = path.join(
  REPO_ROOT, '.tmp/artifacts/sync-group-lifecycle/t151-3-accepted');

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('Local Sync Group lifecycle acceptance requires macOS with Xcode.');
  }
  await withIosAcceptanceArtifacts(REPO_ROOT, async () => {
    await runIosSyncGroupLifecycleAcceptance(REPO_ROOT, ARTIFACT_DIR);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
