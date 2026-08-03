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

export function isRecoverableIosAcceptanceError(error) {
  return error instanceof IosAcceptanceInfrastructureError && RECOVERABLE_KINDS.has(error.kind);
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
