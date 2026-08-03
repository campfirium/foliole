/* global console */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isRecoverableIosAcceptanceError } from './ios-acceptance-infrastructure-error.mjs';

const MAX_ATTEMPTS = 2;

export function acceptanceAttemptDir(artifactRoot, attemptNumber) {
  return path.join(artifactRoot, `attempt-${attemptNumber}`);
}

export async function runIosAcceptanceAttempts(options) {
  mkdirSync(options.artifactRoot, { recursive: true });
  rmSync(path.join(options.artifactRoot, 'summary.json'), { force: true });
  for (let attemptNumber = 1; attemptNumber <= MAX_ATTEMPTS; attemptNumber += 1) {
    rmSync(acceptanceAttemptDir(options.artifactRoot, attemptNumber), { force: true, recursive: true });
  }
  const attempts = [];
  const log = options.log ?? console.log;
  let firstFailureClassification = null;
  let firstUdid = null;
  for (let attemptNumber = 1; attemptNumber <= MAX_ATTEMPTS; attemptNumber += 1) {
    const artifactDir = acceptanceAttemptDir(options.artifactRoot, attemptNumber);
    mkdirSync(artifactDir, { recursive: true });
    log(`[ios-acceptance] attempt ${attemptNumber}/${MAX_ATTEMPTS} started`);
    try {
      const result = await options.runAttempt({ artifactDir, attemptNumber });
      const udid = readOwnedUdid(artifactDir);
      assertDistinctUdid(firstUdid, udid);
      attempts.push({ attempt: attemptNumber, status: 'passed', udid });
      writeSummary(options.artifactRoot, {
        attemptCount: attemptNumber, attempts, firstFailureClassification, status: 'passed'
      });
      log(`[ios-acceptance] attempt ${attemptNumber}/${MAX_ATTEMPTS} passed`);
      return result;
    } catch (error) {
      const udid = readOwnedUdid(artifactDir);
      const finalError = firstUdid && udid === firstUdid
        ? new Error('The recovery attempt reused the first Simulator UDID.', { cause: error })
        : error;
      if (attemptNumber === 1) firstUdid = udid;
      const classification = isRecoverableIosAcceptanceError(finalError) ? finalError.kind : null;
      firstFailureClassification ??= classification;
      attempts.push({ attempt: attemptNumber, classification, status: 'failed', udid });
      const willRetry = attemptNumber === 1 && classification !== null;
      writeSummary(options.artifactRoot, {
        attemptCount: attemptNumber, attempts, firstFailureClassification,
        status: willRetry ? 'retrying' : 'failed'
      });
      log(`[ios-acceptance] attempt ${attemptNumber}/${MAX_ATTEMPTS} failed` +
        (classification ? ` (${classification})` : ' (non-recoverable)'));
      if (!willRetry) throw finalError;
    }
  }
  throw new Error('iOS acceptance attempt orchestration ended unexpectedly.');
}

function readOwnedUdid(artifactDir) {
  try {
    return JSON.parse(readFileSync(path.join(artifactDir, 'simulator-owned.json'), 'utf8')).udid ?? null;
  } catch {
    return null;
  }
}

function assertDistinctUdid(firstUdid, currentUdid) {
  if (firstUdid && currentUdid === firstUdid) {
    throw new Error('The recovery attempt reused the first Simulator UDID.');
  }
}

function writeSummary(artifactRoot, summary) {
  writeFileSync(path.join(artifactRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
}
