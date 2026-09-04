/* global process */

import { expect, it, vi } from 'vitest';

import { classifyCommitDistance, executeScheduledPush } from './scheduled-dev-push.mjs';

function gitFixture(distance) {
  return vi.fn((args) => {
    const command = args.join(' ');
    if (command === 'rev-parse --show-toplevel') return process.cwd();
    if (command === 'branch --show-current') return 'dev';
    if (command.includes('@{upstream}')) return 'origin/dev';
    if (command === 'rev-parse origin/dev') return 'a'.repeat(40);
    if (command.startsWith('fetch ')) return '';
    if (command.startsWith('rev-list ')) return distance;
    if (command.startsWith('push ')) return '';
    throw new Error(`Unexpected Git call: ${command}`);
  });
}

it('classifies the two-sided Git distance without interpreting worktree state', () => {
  expect(classifyCommitDistance('0\t0')).toEqual({ localOnly: 0, remoteOnly: 0, status: 'current' });
  expect(classifyCommitDistance('0\t2')).toEqual({ localOnly: 2, remoteOnly: 0, status: 'ready' });
  expect(classifyCommitDistance('1\t0')).toEqual({ localOnly: 0, remoteOnly: 1, status: 'remote-ahead' });
  expect(classifyCommitDistance('1\t2')).toEqual({ localOnly: 2, remoteOnly: 1, status: 'diverged' });
});

it('pushes only a local-ahead dev history without dispatching an Internal update', () => {
  const git = gitFixture('0\t2');
  const dispatch = vi.fn(() => '');

  expect(executeScheduledPush({ dispatch, git })).toMatchObject({ localOnly: 2, pushed: true });
  expect(git).toHaveBeenCalledWith(
    ['push', '--porcelain', 'origin', 'HEAD:dev'],
    { label: 'push origin/dev' }
  );
  expect(dispatch).not.toHaveBeenCalled();
});

it.each([
  ['0\t0', 'current'],
  ['1\t0', 'remote-ahead'],
  ['1\t2', 'diverged']
])('does not push unsafe or empty history %s', (distance, status) => {
  const git = gitFixture(distance);
  const dispatch = vi.fn();
  const blockedHandoff = vi.fn();
  if (status === 'current') {
    expect(executeScheduledPush({ blockedHandoff, dispatch, git })).toMatchObject({ pushed: false, status });
  } else {
    expect(() => executeScheduledPush({ blockedHandoff, dispatch, git }))
      .toThrow(`Scheduled push stopped: ${status}`);
  }
  expect(git.mock.calls.some(([args]) => args[0] === 'push')).toBe(false);
  expect(dispatch).not.toHaveBeenCalled();
  expect(blockedHandoff).toHaveBeenCalledTimes(status === 'current' ? 0 : 1);
});

it('dry-run fetches and checks history but never writes remote state', () => {
  const git = gitFixture('0\t3');
  const dispatch = vi.fn();

  expect(executeScheduledPush({ dispatch, dryRun: true, git }))
    .toMatchObject({ localOnly: 3, pushed: false, status: 'ready' });
  expect(git.mock.calls.some(([args]) => args[0] === 'push')).toBe(false);
  expect(dispatch).not.toHaveBeenCalled();
});
