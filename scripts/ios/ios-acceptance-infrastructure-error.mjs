import { existsSync, readFileSync } from 'node:fs';

import { waitForAcceptanceObservation } from './ios-simulator-acceptance-runner.mjs';

const RECOVERABLE_KINDS = new Set(['app-launch', 'bridge-result-absent', 'simulator-boot']);

export class IosAcceptanceInfrastructureError extends Error {
  constructor(kind, message, options = {}) {
    super(message, options);
    this.name = 'IosAcceptanceInfrastructureError';
    this.kind = kind;
  }
}

const TIMEOUT_MESSAGE = /timed out|timeout/iu;

// A timeout is retried once on a fresh Simulator like other infrastructure failures;
// a second consecutive timeout fails the scenario for same-platform local review.
export function recoverableIosAcceptanceKind(error) {
  if (error instanceof IosAcceptanceInfrastructureError && RECOVERABLE_KINDS.has(error.kind)) return error.kind;
  for (let current = error; current; current = current.cause) {
    if (TIMEOUT_MESSAGE.test(current instanceof Error ? current.message : String(current))) return 'timeout';
  }
  return null;
}

export function isRecoverableIosAcceptanceError(error) {
  return recoverableIosAcceptanceKind(error) !== null;
}

export function runIosInfrastructureCommand(kind, action) {
  try {
    return action();
  } catch (error) {
    throw new IosAcceptanceInfrastructureError(
      kind,
      error instanceof Error ? error.message : String(error),
      { cause: error }
    );
  }
}

export async function waitForIosBridgeResult(options) {
  let resultFileAppeared = false;
  try {
    return await waitForAcceptanceObservation({
      ...options,
      read: () => {
        resultFileAppeared ||= existsSync(options.resultPath);
        return JSON.parse(readFileSync(options.resultPath, 'utf8'));
      }
    });
  } catch (error) {
    if (resultFileAppeared) throw error;
    throw new IosAcceptanceInfrastructureError(
      'bridge-result-absent',
      error instanceof Error ? error.message : String(error),
      { cause: error }
    );
  }
}
