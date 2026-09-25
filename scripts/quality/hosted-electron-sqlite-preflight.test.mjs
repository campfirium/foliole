// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  isHostedElectronRuntimeTransferFailure,
  runHostedElectronSqlitePreflight
} from './hosted-electron-sqlite-preflight.mjs';

const HOSTED_ENV = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' };
const HTTP_500 = [
  'HTTPError: Response code 500 (Internal Server Error)',
  'https://github.com/electron/electron/releases/download/v44.4.1/electron.zip',
  'at @electron/get/dist/FetchDownloader.js'
].join('\n');

function result(status, stderr = '', extras = {}) {
  return { status, signal: null, stdout: '', stderr, ...extras };
}

async function execute(results, options = {}) {
  const runAttempt = vi.fn(async () => results.shift());
  const sleep = vi.fn(async () => undefined);
  const log = vi.fn();
  const final = await runHostedElectronSqlitePreflight({
    env: options.env ?? HOSTED_ENV, log, runAttempt, sleep
  });
  return { final, log, runAttempt, sleep };
}

describe('hosted Electron sqlite preflight', () => {
  it('retries one hosted Electron HTTP 500 after a bounded backoff', async () => {
    const state = await execute([result(1, HTTP_500), result(0)]);
    expect(state.runAttempt).toHaveBeenCalledTimes(2);
    expect(state.sleep).toHaveBeenCalledExactlyOnceWith(5_000);
    expect(state.final).toMatchObject({ attempts: 2, status: 0 });
    expect(state.log.mock.calls.flat()).toContain(
      '[hosted-electron-preflight] retry classification=electron-runtime-transfer backoff_ms=5000'
    );
  });

  it('returns the second transfer failure without widening the retry budget', async () => {
    const state = await execute([result(1, HTTP_500), result(23, HTTP_500)]);
    expect(state.runAttempt).toHaveBeenCalledTimes(2);
    expect(state.final).toMatchObject({ attempts: 2, status: 23 });
  });

  it.each([
    ['local execution', HTTP_500, {}],
    ['deterministic ABI failure', 'better-sqlite3 is not loadable in the Electron ABI.', HOSTED_ENV],
    ['unrelated HTTP failure', 'HTTPError: Response code 500 for https://example.com/file', HOSTED_ENV],
    ['Electron checksum failure', 'node_modules/electron checksum mismatch', HOSTED_ENV]
  ])('does not retry %s', async (_name, failure, env) => {
    const state = await execute([result(1, failure)], { env });
    expect(state.runAttempt).toHaveBeenCalledTimes(1);
    expect(state.sleep).not.toHaveBeenCalled();
  });

  it('requires hosted identity, Electron source, and transient transport evidence', () => {
    expect(isHostedElectronRuntimeTransferFailure(HTTP_500, { env: HOSTED_ENV })).toBe(true);
    expect(isHostedElectronRuntimeTransferFailure(HTTP_500, { env: {} })).toBe(false);
    expect(isHostedElectronRuntimeTransferFailure('node_modules/electron checksum mismatch', {
      env: HOSTED_ENV
    })).toBe(false);
  });

  it('routes every hosted quality sqlite preflight through the bounded owner', () => {
    const sources = fs.readdirSync('.github/workflows')
      .filter((file) => file.startsWith('hosted-quality-') && file.endsWith('.yml'))
      .map((file) => fs.readFileSync(`.github/workflows/${file}`, 'utf8'));
    expect(sources.filter((source) => source.includes('electron-sqlite-runner.mjs --preflight')))
      .toEqual([]);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((source) => source.includes('hosted-electron-sqlite-preflight.mjs')))
      .toBe(true);
  });
});
