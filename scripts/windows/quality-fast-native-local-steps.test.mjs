// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { splitRelatedTests } from '../quality/quality-fast-capped.mjs';
import { runNativeLightMidPlan } from './quality-fast-native-local-steps.mjs';

const PLAN = {
  level: 'light',
  lintTargets: [],
  relatedTests: ['src/app/App.test.tsx', 'electron/main.test.ts']
};

function optionsFor(runner) {
  return {
    env: { npm_execpath: '/npm-cli.js' },
    runner,
    splitRelatedTests,
    runStep: async (label, command, args, env, activeRunner) => {
      const code = await activeRunner(command, args, { env, label });
      if (code !== 0) throw new Error(`${label} failed`);
    }
  };
}

describe('quality-fast-native local light plan', () => {
  it('runs planned related tests through the correct ABI runners', async () => {
    const calls = [];
    await runNativeLightMidPlan(PLAN, optionsFor(async (command, args, details) => {
      calls.push({ args, command, label: details.label });
      return 0;
    }));

    expect(calls.find((call) => call.label === 'related tests').args)
      .toContain('src/app/App.test.tsx');
    expect(calls.find((call) => call.label === 'electron related tests').args)
      .toContain('scripts/electron-sqlite-runner.mjs');
  });

  it('propagates a planned related-test failure', async () => {
    await expect(runNativeLightMidPlan(PLAN, optionsFor(
      async (_command, _args, details) => details.label === 'related tests' ? 1 : 0
    ))).rejects.toThrow('related tests failed');
  });
});
