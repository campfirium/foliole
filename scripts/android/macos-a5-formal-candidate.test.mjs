// @vitest-environment node

import { expect, it } from 'vitest';

import {
  beginFormalA5Candidate, finishFormalA5Candidate, parseMacosA5Invocation
} from './macos-a5-formal-candidate.mjs';

const REVISION = 'a'.repeat(40);

function gitResults(values) {
  let index = 0;
  return () => `${values[index++] ?? ''}\n`;
}

it('keeps ordinary workspace actions separate from formal acceptance', () => {
  expect(parseMacosA5Invocation(['deploy'])).toEqual({ action: 'deploy', formal: false });
  expect(finishFormalA5Candidate(null, '/repo')).toBeNull();
  expect(parseMacosA5Invocation(['deploy', '--formal']))
    .toEqual({ action: 'deploy', formal: true });
  expect(() => parseMacosA5Invocation(['deploy', 'extra'])).toThrow('Usage');
});

it('freezes one clean committed dev revision for formal acceptance', () => {
  const expected = beginFormalA5Candidate('/repo', gitResults(['dev', REVISION, '']));
  expect(expected).toMatchObject({ branch: 'dev', revision: REVISION, status: '' });
  expect(finishFormalA5Candidate(
    expected, '/repo', gitResults(['dev', REVISION, ''])
  )).toBe(REVISION);
});

it('rejects dirty, non-dev, or moving formal candidates', () => {
  expect(() => beginFormalA5Candidate(
    '/repo', gitResults(['dev', REVISION, ' M src/app.ts'])
  )).toThrow('clean committed worktree');
  expect(() => beginFormalA5Candidate(
    '/repo', gitResults(['release', REVISION, ''])
  )).toThrow('dev branch');
  expect(() => finishFormalA5Candidate(
    { branch: 'dev', revision: REVISION, status: '' },
    '/repo', gitResults(['dev', 'b'.repeat(40), ''])
  )).toThrow('revision changed');
});
