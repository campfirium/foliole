#!/usr/bin/env node
/* global console, process */

import path from 'node:path';

import {
  clearInternalRequests, resolveLatestInternalRequest, waitForInternalRequests
} from './internal-update-queue.mjs';
import { runInternalUpdateWithHandoff } from './run-internal-update.mjs';

export async function coordinateInternalUpdate(options, dependencies = {}) {
  const waitForRequests = dependencies.waitForRequests ?? waitForInternalRequests;
  const resolveRequest = dependencies.resolveRequest ?? resolveLatestInternalRequest;
  const update = dependencies.update ?? runInternalUpdateWithHandoff;
  const clearRequests = dependencies.clearRequests ?? clearInternalRequests;
  const requests = await waitForRequests(options.stateRoot);
  if (requests.length === 0) {
    console.log('[internal-update] skipped no-pending-request');
    return { status: 'skipped' };
  }
  const request = resolveRequest(requests, options.repositoryRoot, dependencies.run);
  const result = await update({
    originThreadId: request.originThreadId,
    repositoryRoot: options.repositoryRoot,
    revision: request.revision,
    stateRoot: options.stateRoot
  });
  clearRequests(options.stateRoot, request.requestedAt);
  return result;
}

function parseArgs(argv) {
  const read = (flag) => argv[argv.indexOf(flag) + 1];
  return { repositoryRoot: read('--repository'), stateRoot: read('--state-root') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  coordinateInternalUpdate(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
