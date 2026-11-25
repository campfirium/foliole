// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { evaluateStagedScope, findUndeclaredPaths, parseDeclaredPaths } from './check-staged-scope.mjs';

const base = {
  enabled: true,
  linkedWorktree: false,
  indexFile: '.git/index',
  sequencerActive: false,
  staged: ['src/a.ts', 'src/b.ts'],
  env: {},
};

describe('check-staged-scope', () => {
  it('blocks an unscoped commit of a shared index', () => {
    expect(evaluateStagedScope(base)).toMatchObject({ ok: false, reason: 'unscoped' });
  });

  it('allows path-limited commits, which use a temporary index', () => {
    expect(evaluateStagedScope({ ...base, indexFile: '/repo/.git/next-index-123.lock' })).toEqual({ ok: true });
  });

  it('allows disabled checkouts, linked worktrees, sequencer commits and empty indexes', () => {
    expect(evaluateStagedScope({ ...base, enabled: false }).ok).toBe(true);
    expect(evaluateStagedScope({ ...base, linkedWorktree: true }).ok).toBe(true);
    expect(evaluateStagedScope({ ...base, sequencerActive: true }).ok).toBe(true);
    expect(evaluateStagedScope({ ...base, staged: [] }).ok).toBe(true);
  });

  it('checks staged files against declared paths', () => {
    expect(evaluateStagedScope({ ...base, env: { FOLIOLE_COMMIT_PATHS: 'src' } }).ok).toBe(true);
    expect(evaluateStagedScope({ ...base, env: { FOLIOLE_COMMIT_PATHS: 'src/a.ts' } })).toMatchObject({
      ok: false,
      reason: 'undeclared',
      extras: ['src/b.ts'],
    });
  });

  it('allows an explicit whole-index commit', () => {
    expect(evaluateStagedScope({ ...base, env: { FOLIOLE_COMMIT_WHOLE_INDEX: '1' } }).ok).toBe(true);
  });

  it('parses declared paths and matches directories by prefix only', () => {
    expect(parseDeclaredPaths('./src/,docs\n a.md ')).toEqual(['src', 'docs', 'a.md']);
    expect(findUndeclaredPaths(['src/x', 'srcx/y'], ['src'])).toEqual(['srcx/y']);
  });
});
