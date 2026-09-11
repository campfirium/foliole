// @vitest-environment node

import { expect, it } from 'vitest';

import {
  beginFormalA5Candidate, parseMacosA5Invocation
} from './macos-a5-formal-candidate.mjs';

const REVISION = 'a'.repeat(40);
const TREE = 'b'.repeat(40);

function gitResults(values, calls = []) {
  let index = 0;
  return (_command, args) => {
    calls.push(args);
    return `${values[index++] ?? ''}\n`;
  };
}

it('keeps ordinary workspace actions separate from formal acceptance', () => {
  expect(parseMacosA5Invocation(['deploy'])).toEqual({ action: 'deploy', formal: false });
  expect(parseMacosA5Invocation(['deploy', '--formal']))
    .toEqual({ action: 'deploy', formal: true });
  expect(() => parseMacosA5Invocation(['deploy', 'extra'])).toThrow('Usage');
});

it('freezes the current checkout revision and tree without naming a branch', () => {
  const calls = [];
  const expected = beginFormalA5Candidate('/repo', gitResults([REVISION, TREE], calls));
  expect(expected).toEqual({ revision: REVISION, tree: TREE });
  expect(calls).toEqual([
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    ['rev-parse', '--verify', `${REVISION}^{tree}`]
  ]);
});

it('rejects incomplete Git object identities', () => {
  expect(() => beginFormalA5Candidate('/repo', gitResults(['short', TREE])))
    .toThrow('full Git revision');
});
