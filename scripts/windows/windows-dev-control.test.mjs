// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  parseWindowsDevControlArgs, runWindowsDevControl, windowsDevPushSpec
} from './windows-dev-control.mjs';

it('accepts only push with an explicit LAN host', () => {
  expect(parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'push'], {}))
    .toEqual({ host: 'v\\dev@192.168.0.11' });
  expect(() => parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'build'], {}))
    .toThrow('only accepts push');
});

it('pushes the current dev commit to refs/heads/dev through the fixed receiver name', async () => {
  const sha = 'a'.repeat(40);
  const calls = [];
  const executeGit = vi.fn(async (args) => {
    calls.push(args);
    if (args.includes('--show-current')) return 'dev\n';
    if (args.includes('rev-parse')) return `${sha}\n`;
    return '';
  });
  const stdout = { write: vi.fn() };
  await expect(runWindowsDevControl({
    argv: ['--host', 'v\\dev@192.168.0.11', 'push'], env: {}, executeGit, stdout
  })).resolves.toMatchObject({ commitSha: sha, ref: 'refs/heads/dev' });
  expect(calls.at(-1)).toEqual([
    'push', '--porcelain', 'v\\dev@192.168.0.11:foliole-dev.git', `${sha}:refs/heads/dev`
  ]);
});

it('uses only the dedicated Git key and strict host checking', () => {
  const spec = windowsDevPushSpec('v\\dev@192.168.0.11', 'b'.repeat(40), {}, '/Users/dev');
  expect(spec.env.GIT_SSH_COMMAND).toContain('foliole-windows-android-lab-git');
  expect(spec.env.GIT_SSH_COMMAND).toContain('StrictHostKeyChecking=yes');
});
