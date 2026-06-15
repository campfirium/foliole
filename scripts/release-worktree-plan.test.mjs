// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  createReleaseWorktreePlan,
  formatReleaseWorktreePlan,
  parseReleaseWorktreeArgs,
} from './release-worktree-plan.mjs';

describe('release worktree plan', () => {
  it('prints the fixed release branch create, init, tag, and cleanup commands', () => {
    const plan = createReleaseWorktreePlan({
      version: '0.6.4',
      candidate: 'abc1234',
    });
    const output = formatReleaseWorktreePlan(plan);

    expect(output).toContain('git worktree add ../foliole-release-0.6.4 -b release/0.6.4 abc1234');
    expect(output).toContain('npm ci');
    expect(output).toContain('npm run electron:rebuild:native');
    expect(output).toContain('release_ref=v0.6.4');
    expect(output).toContain('git worktree remove ../foliole-release-0.6.4');
    expect(output).toContain('git branch -D release/0.6.4');
  });

  it('rejects moving refs as release candidates', () => {
    expect(() => createReleaseWorktreePlan({ version: '0.6.4', candidate: 'dev' })).toThrow(
      'not a moving branch ref'
    );
    expect(() => createReleaseWorktreePlan({ version: '0.6.4', candidate: 'release/0.6.3' })).toThrow(
      'not a moving branch ref'
    );
    expect(() => createReleaseWorktreePlan({ version: '0.6.4', candidate: 'my-feature' })).toThrow(
      'not a moving branch ref'
    );
  });

  it('parses explicit worktree overrides without running git', () => {
    const args = parseReleaseWorktreeArgs([
      '--version',
      '0.6.4',
      '--candidate',
      'abc1234',
      '--worktree',
      '../custom-release',
    ]);

    expect(createReleaseWorktreePlan(args).worktreePath).toBe('../custom-release');
  });
});
