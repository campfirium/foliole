// @vitest-environment node
import fs from 'node:fs';
import process from 'node:process';

import { expect, it } from 'vitest';

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

it('runs from the full-scope iOS contract job', () => {
  const workflow = fs.readFileSync('.github/workflows/hosted-quality-ios.yml', 'utf8');
  expect(workflow).toMatch(/Compile the complete iOS app without launching a simulator\n\s+if: inputs\.scope == 'full'\n\s+run: node scripts\/ios\/ios-unsigned-app-compile\.mjs/u);
});
