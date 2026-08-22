// @vitest-environment node

import { expect, it } from 'vitest';

import {
  beginFormalA5Candidate, parseMacosA5Invocation
} from './macos-a5-formal-candidate.mjs';

const REVISION = 'a'.repeat(40);
const TREE = 'b'.repeat(40);

function gitResults(values) {
  let index = 0;
  return () => `${values[index++] ?? ''}\n`;
}

it('keeps ordinary workspace actions separate from formal acceptance', () => {
  expect(parseMacosA5Invocation(['deploy'])).toEqual({ action: 'deploy', formal: false });
  expect(parseMacosA5Invocation(['deploy', '--formal']))
    .toEqual({ action: 'deploy', formal: true });
  expect(() => parseMacosA5Invocation(['deploy', 'extra'])).toThrow('Usage');
});

it('freezes the committed dev revision and tree without inspecting the worktree', () => {
  const expected = beginFormalA5Candidate('/repo', gitResults([REVISION, TREE]));
  expect(expected).toEqual({ revision: REVISION, tree: TREE });
});

it('rejects incomplete Git object identities', () => {
  expect(() => beginFormalA5Candidate('/repo', gitResults(['short', TREE])))
    .toThrow('full Git revision');
});
