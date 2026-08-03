// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  isHostedElectronTransferFailure,
  resolveNpmInvocation,
  runHostedNpmCi
} from './hosted-npm-ci.mjs';

const HOSTED_ENV = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' };
const ELECTRON_FETCH_FAILURE = [
  'npm error path /home/runner/work/Foliole/node_modules/electron',
  'npm error command sh -c node install.js',
  'npm error RequestError: fetch failed',
  '    at @electron/get/dist/cjs/GotDownloader.js'
].join('\n');

function result(status, stderr = '', extras = {}) {
  return { status, signal: null, stdout: '', stderr, ...extras };
}

async function execute(results, options = {}) {
  const runAttempt = vi.fn(async () => results.shift());
  const sleep = vi.fn(async () => undefined);
  const log = vi.fn();
  const final = await runHostedNpmCi({
    args: options.args ?? [],
    env: options.env ?? HOSTED_ENV,
    runAttempt,
    sleep,
    log
  });
  return { final, log, runAttempt, sleep };
}

describe('hosted npm ci recovery', () => {
  it('runs npm CLI through the current Node executable on Windows', () => {
    expect(resolveNpmInvocation({
      env: { npm_execpath: 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js' },
      execPath: 'C:\\node\\node.exe',
      platform: 'win32'
    })).toEqual({
      argsPrefix: ['C:\\node\\node_modules\\npm\\bin\\npm-cli.js'],
      command: 'C:\\node\\node.exe'
    });
    expect(resolveNpmInvocation({ platform: 'linux' }))
      .toEqual({ argsPrefix: [], command: 'npm' });
  });

  it('runs a successful install once with explicit attempt boundaries', async () => {
    const state = await execute([result(0)]);
    expect(state.runAttempt).toHaveBeenCalledTimes(1);
    expect(state.sleep).not.toHaveBeenCalled();
    expect(state.log.mock.calls.flat()).toEqual([
      '[hosted-npm-ci] attempt 1/2 start',
      '[hosted-npm-ci] attempt 1/2 end status=0'
    ]);
  });

  it('retries one exact Electron transfer failure after one backoff', async () => {
    const state = await execute([result(1, ELECTRON_FETCH_FAILURE), result(0)]);
    expect(state.runAttempt).toHaveBeenCalledTimes(2);
    expect(state.sleep).toHaveBeenCalledExactlyOnceWith(5_000);
    expect(state.final).toMatchObject({ attempts: 2, status: 0 });
    expect(state.final.attemptResults.map(({ stderr }) => stderr))
      .toEqual([ELECTRON_FETCH_FAILURE, '']);
    expect(state.log.mock.calls.flat()).toContain(
      '[hosted-npm-ci] retry classification=electron-transient-transfer backoff_ms=5000'
    );
    expect(state.log.mock.calls.flat()).toContain('[hosted-npm-ci] attempt 2/2 start');
  });

  it.each([
    ['lockfile mismatch', 'npm error npm ci can only install with an existing package-lock.json'],
    ['dependency resolution', 'npm error code ERESOLVE\nnpm error unable to resolve dependency tree'],
    ['non-Electron postinstall', 'npm error path node_modules/example\nnpm error command sh -c node install.js\nnpm error fetch failed'],
    ['transfer failure without Electron source', 'npm error fetch failed'],
    ['Electron failure without transient transfer', 'npm error path node_modules/electron\nnpm error command sh -c node install.js\nnpm error checksum mismatch']
  ])('does not retry %s', async (_name, failure) => {
    const state = await execute([result(1, failure)]);
    expect(state.runAttempt).toHaveBeenCalledTimes(1);
    expect(state.final.status).toBe(1);
  });

  it('does not retry when install scripts are disabled or the runner is not hosted', async () => {
    const ignored = await execute([result(1, ELECTRON_FETCH_FAILURE)], { args: ['--ignore-scripts'] });
    const local = await execute([result(1, ELECTRON_FETCH_FAILURE)], { env: {} });
    expect(ignored.runAttempt).toHaveBeenCalledTimes(1);
    expect(local.runAttempt).toHaveBeenCalledTimes(1);
    expect(ignored.log.mock.calls.flat()[0]).toBe('[hosted-npm-ci] attempt 1/1 start');
    expect(local.log.mock.calls.flat()[0]).toBe('[hosted-npm-ci] attempt 1/1 start');
  });

  it('uses only the current attempt output for classification and stops after attempt two', async () => {
    const state = await execute([
      result(1, ELECTRON_FETCH_FAILURE),
      result(23, 'npm error deterministic build script failure')
    ]);
    expect(state.runAttempt).toHaveBeenCalledTimes(2);
    expect(state.final).toMatchObject({ attempts: 2, status: 23 });
  });

  it('preserves a terminating signal without retrying it', async () => {
    const state = await execute([
      result(null, ELECTRON_FETCH_FAILURE, { signal: 'SIGTERM' })
    ]);
    expect(state.runAttempt).toHaveBeenCalledTimes(1);
    expect(state.final).toMatchObject({ attempts: 1, status: null, signal: 'SIGTERM' });
  });

  it('requires hosted identity, Electron source, and transient transport evidence', () => {
    expect(isHostedElectronTransferFailure(ELECTRON_FETCH_FAILURE, { env: HOSTED_ENV })).toBe(true);
    expect(isHostedElectronTransferFailure(ELECTRON_FETCH_FAILURE, { env: {} })).toBe(false);
    expect(isHostedElectronTransferFailure('npm error fetch failed', { env: HOSTED_ENV })).toBe(false);
  });
});
