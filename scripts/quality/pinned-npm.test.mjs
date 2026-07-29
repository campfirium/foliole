// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { activatePinnedNpm, readPinnedNpm, verifyPinnedNpm } from './pinned-npm.mjs';

const PINNED_NPM = readPinnedNpm();

function successfulRunner(version = PINNED_NPM.version) {
  return vi.fn((command, args) => ({
    status: 0,
    stdout: args[0] === '--version' ? `${version}\n` : '',
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

  it('fails closed when the active npm does not match the repository pin', () => {
    expect(() => verifyPinnedNpm({ runner: successfulRunner('0.0.0'), platform: 'linux' }))
      .toThrow(`expected ${PINNED_NPM.descriptor}, received npm@0.0.0`);
  });
});
