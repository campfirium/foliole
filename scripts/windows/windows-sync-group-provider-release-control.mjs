#!/usr/bin/env node
/* global console, process, URL */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  readJson, syncGroupInteractivePaths, validateSyncGroupInteractiveRequest, writeJsonAtomic
} from './windows-sync-group-interactive-state.mjs';

export const WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS = Object.freeze({
  cancelled: 'multi-device-sync-provider-cancel',
  consumer_complete: 'multi-device-sync-provider-complete'
});

export function isWindowsSyncGroupProviderReleaseAction(action) {
  return Object.values(WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS).includes(action);
}

export function writeWindowsSyncGroupProviderRelease({ repoRoot, status }) {
  if (!Object.hasOwn(WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS, status)) {
    throw new Error('invalid Sync Group provider release status');
  }
  const paths = syncGroupInteractivePaths(repoRoot);
  const request = validateSyncGroupInteractiveRequest(readJson(paths.request), repoRoot);
  const lifecycle = readJson(paths.status);
  if (lifecycle?.schemaVersion !== 1 || lifecycle.nonce !== request.nonce
      || lifecycle.state !== 'running') {
    throw new Error('Sync Group provider is not running for the current request');
  }
  const release = {
    action: request.action, nonce: request.nonce, schemaVersion: 1, status
  };
  writeJsonAtomic(paths.providerRelease, release);
  return release;
}

function main() {
  const release = writeWindowsSyncGroupProviderRelease({
    repoRoot: path.resolve(fileURLToPath(new URL('../..', import.meta.url))), status: process.argv[2]
  });
  console.log(`[windows-sync-group-provider-release] ${release.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) {
    console.error(`[windows-sync-group-provider-release] ${error.message}`);
    process.exitCode = 1;
  }
}
