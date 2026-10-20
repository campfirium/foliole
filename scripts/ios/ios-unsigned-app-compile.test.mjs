// @vitest-environment node
import fs from 'node:fs';
import process from 'node:process';

import { expect, it } from 'vitest';
import { parse } from 'yaml';

import { createUnsignedAppCompileSteps, runUnsignedAppCompile } from './ios-unsigned-app-compile.mjs';

it('compiles the complete app unsigned for a generic simulator without launching one', () => {
  const steps = createUnsignedAppCompileSteps('/repo');
  expect(steps.map(([command]) => command)).toEqual(['npm', 'npx', 'xcodebuild']);
  const xcodebuild = steps[2][1];
  expect(xcodebuild).toEqual(expect.arrayContaining([
    '-scheme', 'App', '-destination', 'generic/platform=iOS Simulator', 'CODE_SIGNING_ALLOWED=NO', 'build'
  ]));
  expect(xcodebuild.join(' ')).not.toMatch(/\.tmp\/artifacts|simctl|launch/u);
});

it('stops at the first failing step', () => {
  const calls = [];
  expect(() => runUnsignedAppCompile(process.cwd(), (command) => {
    calls.push(command);
    return { status: command === 'npx' ? 1 : 0 };
  })).toThrow('npx failed with exit 1');
  expect(calls).toEqual(['npm', 'npx']);
});

it('runs in its own full-scope job beside the iOS contract job', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/hosted-quality-ios.yml', 'utf8'));
  const call = workflow.jobs['app-compile'];
  expect(call.if).toBe("inputs.run_contract && inputs.scope == 'full'");
  expect(call.needs).toBeUndefined();
  expect(call.uses).toBe('./.github/workflows/hosted-quality-ios-app-compile.yml');
  const compile = parse(fs.readFileSync(call.uses, 'utf8'));
  expect(compile.permissions).toEqual({ contents: 'read' });
  expect(compile.jobs['app-compile'].steps.find(
    ({ name }) => name === 'Compile the complete iOS app without launching a simulator'
  ).run).toBe('node scripts/ios/ios-unsigned-app-compile.mjs');
  expect(JSON.stringify(workflow.jobs.contract.steps)).not.toContain('ios-unsigned-app-compile');
  expect(workflow.on.workflow_call.outputs.accepted_sha.value).toBe("${{ (inputs.scope != 'full' "
    + '|| jobs.contract.outputs.accepted_sha == jobs.app-compile.outputs.accepted_sha) '
    + '&& jobs.contract.outputs.accepted_sha || jobs.simulator.outputs.accepted_sha }}');
  const accepted = ({ scope, contract = '', app = '', simulator = '' }) => (
    (scope !== 'full' || contract === app) && contract || simulator);
  const sha = 'a'.repeat(40);
  expect(accepted({ scope: 'full', contract: sha, app: sha })).toBe(sha);
  expect(accepted({ scope: 'full', contract: sha })).toBe('');
  expect(accepted({ scope: 'full', app: sha })).toBe('');
  expect(accepted({ scope: 'ios', contract: sha })).toBe(sha);
  expect(accepted({ scope: 'full', simulator: sha })).toBe(sha);
});
