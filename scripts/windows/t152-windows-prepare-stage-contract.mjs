/* global process */

import { createHash } from 'node:crypto';
import path from 'node:path';

export const PREPARE_DEADLINE_MS = 45 * 60 * 1000;
export const PREPARE_STAGES = Object.freeze(['materialize', 'dependencies', 'electron-runtime',
  'build', 'electron-compile', 'native', 'package', 'finalize']);

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function command(name, file, args) {
  if (!file || !Array.isArray(args) || !args.every((item) => typeof item === 'string')) {
    throw new Error(`prepare ${name} argv is invalid`);
  }
  return freeze({ args: [...args], file, name, shell: false });
}

export function createPrepareStagePlan(request) {
  const source = request.sourceRoot;
  const npm = (name, args) => command(name, request.npmPath, ['--prefix', source, ...args]);
  const entries = [
    { stage: 'materialize', commands: [
      command('extract-product', request.tarPath,
        ['-xf', request.productArchivePath, '-C', source]),
      command('extract-controller', request.tarPath,
        ['-xf', request.controllerArchivePath, '-C', request.controllerRoot])
    ] },
    { stage: 'dependencies', commands: [npm('dependencies', ['ci'])] },
    { stage: 'electron-runtime', commands: [command('electron-runtime', request.nodePath,
      [path.win32.join(source, 'node_modules', 'electron', 'install.js')])] },
    { stage: 'build', commands: [npm('build', ['run', 'build'])] },
    { stage: 'electron-compile', commands: [npm('electron-compile',
      ['run', 'electron:compile'])] },
    { stage: 'native', commands: [npm('native-rebuild', ['run', 'electron:rebuild:native']),
      command('native-probe', path.win32.join(source, 'node_modules', 'electron', 'dist',
        'electron.exe'), [path.win32.join(source, 'scripts', 'desktop',
        'desktop-dnssd-native-probe.cjs')])] },
    { stage: 'package', commands: [npm('package-smoke', ['run', 'windows:package'])] },
    { stage: 'finalize', commands: [] }
  ];
  return freeze({ entries, schemaVersion: 1 });
}

export function prepareStagePlanSha256(plan) {
  return digest(JSON.stringify(plan));
}

export function createPrepareStageReceipt({ deadlineAt, endedAt, facts = null, failure = null,
  outcome, planSha256, predecessorReceiptSha256 = null, request, requestSha256, stage,
  startedAt, tokenSha256 }) {
  if (!PREPARE_STAGES.includes(stage) || !/^[0-9a-f]{64}$/u.test(planSha256 ?? '')
      || !outcome || !Object.hasOwn(outcome, 'exitCode')
      || !Object.hasOwn(outcome, 'signal') || !Object.hasOwn(outcome, 'timedOut')) {
    throw new Error('prepare receipt input is invalid');
  }
  const resultStatus = outcome.timedOut ? 'timeout'
    : outcome.exitCode === 0 && outcome.signal === null && !outcome.error ? 'success' : 'failed';
  return { capsuleId: request.capsuleId, capsuleRoot: request.capsuleRoot,
    deadlineAt, durationMs: Date.parse(endedAt) - Date.parse(startedAt), endedAt,
    facts: resultStatus === 'success' ? facts : null,
    failure: resultStatus === 'success' ? null : (failure ?? outcome.error ?? 'stage failed'),
    hostFactsSha256: request.hostFactsSha256, identity: request.identity,
    planSha256, predecessorReceiptSha256, rawExit: outcome.exitCode,
    rawSignal: outcome.signal, requestSha256, resultStatus, rootId: request.rootId,
    schemaVersion: 2, stage, startedAt, timedOut: outcome.timedOut, tokenSha256 };
}

export function createPrepareContractProjection(request, requestSha256, tokenSha256) {
  const plan = createPrepareStagePlan(request);
  const planSha256 = prepareStagePlanSha256(plan);
  const matrices = Object.fromEntries(PREPARE_STAGES.map((stage, index) => {
    const common = { deadlineAt: '2030-01-01T00:45:00.000Z',
      endedAt: '2030-01-01T00:00:01.000Z', planSha256,
      predecessorReceiptSha256: index ? 'a'.repeat(64) : null,
      request, requestSha256, stage, startedAt: '2030-01-01T00:00:00.000Z', tokenSha256 };
    const project = (outcome, failure) => JSON.parse(JSON.stringify(
      createPrepareStageReceipt({ ...common, failure, facts: { projected: true }, outcome })));
    return [stage, { failure: project({ error: 'contract failure', exitCode: 9,
      signal: null, timedOut: false }, 'contract failure'),
    success: project({ error: null, exitCode: 0, signal: null, timedOut: false }),
    timeout: project({ error: 'contract timeout', exitCode: null,
      signal: 'SIGTERM', timedOut: true }, 'contract timeout') }];
  }));
  return { matrices, nodeVersion: process.version, plan, planSha256,
    projectionSha256: digest(JSON.stringify(matrices)), schemaVersion: 1 };
}
