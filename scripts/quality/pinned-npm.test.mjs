// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  activatePinnedNpm,
  isHostedPinnedNpmRegistryFailure,
  readPinnedNpm,
  verifyPinnedNpm
} from './pinned-npm.mjs';

const PINNED_NPM = readPinnedNpm();
const HOSTED_ENV = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' };
const TRANSIENT_FAILURE = [
  'Internal Error: Error when performing the request to',
  `https://registry.npmjs.org/npm/-/npm-${PINNED_NPM.version}.tgz`
].join(' ');
const TERMINATED_SOCKET_FAILURE = [
  `Installing npm@${PINNED_NPM.version}...`,
  'TypeError: terminated',
  "[cause]: SocketError: other side closed code: 'UND_ERR_SOCKET'"
].join('\n');
const QUIET_STREAM = { write: vi.fn() };

function successfulRunner(version = PINNED_NPM.version) {
  return vi.fn((command, args) => ({
    status: 0,
    stdout: args.includes('--version') || args.includes('npm.cmd --version') ? `${version}\n` : '',
    stderr: ''
  }));
}

describe('pinned npm quality tooling', () => {
  it('reads the exact npm toolchain declared by the repository', () => {
    expect(PINNED_NPM.descriptor).toMatch(/^npm@\d+\.\d+\.\d+(?:\+.+)?$/u);
  });

  it('activates the declared npm through Corepack before verifying it', () => {
    const runner = successfulRunner();
    const log = vi.fn();

    activatePinnedNpm({ runner, platform: 'linux', log });

    expect(runner.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ['corepack', ['enable', 'npm']],
      ['corepack', ['install', '--global', PINNED_NPM.descriptor]],
      ['npm', ['--version']]
    ]);
    expect(log).toHaveBeenCalledWith(`[pinned-npm] ok: ${PINNED_NPM.descriptor}`);
  });

  it('retries one hosted npm registry failure and then succeeds', () => {
    const runner = successfulRunner();
    runner
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: TRANSIENT_FAILURE });
    const sleep = vi.fn();
    const log = vi.fn();

    activatePinnedNpm({
      env: HOSTED_ENV,
      log,
      platform: 'linux',
      runner,
      sleep,
      stderr: QUIET_STREAM,
      stdout: QUIET_STREAM
    });

    expect(runner).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(5_000);
    expect(log.mock.calls.flat()).toContain(
      '[pinned-npm] retry classification=npm-registry-transient backoff_ms=5000'
    );
  });

  it('retries a hosted pinned npm socket termination without a printed tarball URL', () => {
    const runner = successfulRunner();
    runner
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: TERMINATED_SOCKET_FAILURE, stderr: '' });
    const sleep = vi.fn();

    activatePinnedNpm({
      env: HOSTED_ENV,
      platform: 'win32',
      runner,
      sleep,
      stderr: QUIET_STREAM,
      stdout: QUIET_STREAM,
      windowsShell: 'cmd.exe'
    });

    expect(runner).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(5_000);
  });

  it('stops after the second hosted npm registry failure', () => {
    const runner = successfulRunner();
    runner
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: TRANSIENT_FAILURE })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: TRANSIENT_FAILURE });
    const sleep = vi.fn();

    expect(() => activatePinnedNpm({
      env: HOSTED_ENV,
      platform: 'linux',
      runner,
      sleep,
      stderr: QUIET_STREAM,
      stdout: QUIET_STREAM
    }))
      .toThrow(`corepack install --global ${PINNED_NPM.descriptor} exited 1`);
    expect(runner).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(5_000);
  });

  it('does not retry deterministic or unclassified activation failures', () => {
    const failures = [
      `${TRANSIENT_FAILURE} HTTP 404`,
      'corepack configuration is malformed'
    ];
    for (const failure of failures) {
      const runner = successfulRunner();
      runner
        .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
        .mockReturnValueOnce({ status: 1, stdout: '', stderr: failure });
      const sleep = vi.fn();
      expect(() => activatePinnedNpm({
        env: HOSTED_ENV,
        platform: 'linux',
        runner,
        sleep,
        stderr: QUIET_STREAM,
        stdout: QUIET_STREAM
      }))
        .toThrow(`corepack install --global ${PINNED_NPM.descriptor} exited 1`);
      expect(runner).toHaveBeenCalledTimes(2);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('fails closed when the active npm does not match the repository pin', () => {
    expect(() => verifyPinnedNpm({ runner: successfulRunner('0.0.0'), platform: 'linux' }))
      .toThrow(`expected ${PINNED_NPM.descriptor}, received npm@0.0.0`);
  });

  it('launches Windows command shims through cmd.exe', () => {
    const runner = successfulRunner();

    activatePinnedNpm({ runner, platform: 'win32', windowsShell: 'cmd.exe' });

    expect(runner.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ['cmd.exe', ['/d', '/s', '/c', 'corepack.cmd enable npm']],
      ['cmd.exe', ['/d', '/s', '/c', `corepack.cmd install --global ${PINNED_NPM.descriptor}`]],
      ['cmd.exe', ['/d', '/s', '/c', 'npm.cmd --version']]
    ]);
  });

  it('requires hosted identity and pinned npm install context', () => {
    expect(isHostedPinnedNpmRegistryFailure(TRANSIENT_FAILURE, {
      env: HOSTED_ENV,
      version: PINNED_NPM.version
    })).toBe(true);
    expect(isHostedPinnedNpmRegistryFailure(TRANSIENT_FAILURE, {
      env: {},
      version: PINNED_NPM.version
    })).toBe(false);
    expect(isHostedPinnedNpmRegistryFailure('fetch failed', {
      env: HOSTED_ENV,
      version: PINNED_NPM.version
    })).toBe(false);
    expect(isHostedPinnedNpmRegistryFailure(TERMINATED_SOCKET_FAILURE, {
      env: HOSTED_ENV,
      version: PINNED_NPM.version
    })).toBe(true);
  });
});
