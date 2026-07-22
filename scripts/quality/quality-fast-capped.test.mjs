// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  resolveCappedTypecheckScripts,
  resolveNpmRunCommand,
  runCappedHeavyPlan,
  splitRelatedTests
} from './quality-fast-capped.mjs';

describe('cross-host capped quality plan', () => {
  it('keeps scope-specific typechecks bounded and leaves iOS compilation remote', () => {
    expect(resolveCappedTypecheckScripts('desktop')).toEqual(['typecheck:desktop']);
    expect(resolveCappedTypecheckScripts('shared')).toEqual(['typecheck:shared']);
    expect(resolveCappedTypecheckScripts('android')).toEqual(['typecheck:android']);
    expect(resolveCappedTypecheckScripts('ios')).toEqual([]);
    expect(resolveCappedTypecheckScripts('full')).toEqual([
      'typecheck:desktop', 'typecheck:shared', 'typecheck:android'
    ]);
  });

  it('routes Electron ABI-sensitive related tests through the controlled runner', () => {
    expect(splitRelatedTests([
      'electron/database/example.test.ts',
      'src/shared/platform/companionSyncNodeVersions.test.ts',
      'src/shared/platform/plainHelper.test.ts'
    ])).toEqual({
      electron: [
        'electron/database/example.test.ts',
        'src/shared/platform/companionSyncNodeVersions.test.ts'
      ],
      ordinary: ['src/shared/platform/plainHelper.test.ts']
    });
  });

  it('runs npm scripts through the npm CLI with the current Node on Windows', () => {
    expect(resolveNpmRunCommand(
      'typecheck:shared',
      { npm_execpath: 'C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js' },
      'win32',
      'C:\\nodejs\\node.exe'
    )).toEqual({
      args: ['C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', 'run', 'typecheck:shared'],
      command: 'C:\\nodejs\\node.exe'
    });
    expect(() => resolveNpmRunCommand('typecheck:shared', {}, 'win32'))
      .toThrow('npm_execpath is required for capped quality on win32');
  });

  it('executes the same capped plan contract on every local host', async () => {
    const calls = [];
    await runCappedHeavyPlan({
      level: 'desktop', lintTargets: ['electron/main.ts'],
      relatedTests: ['src/app/App.test.tsx', 'electron/main.test.ts']
    }, {
      env: { npm_execpath: '/npm/cli.js' },
      runner: async (command, args, options) => {
        calls.push({ args, command, label: options.label });
        return 0;
      }
    });
    expect(calls.map((call) => call.label)).toEqual([
      'scoped lint', 'typecheck:desktop', 'related tests', 'electron related tests'
    ]);
    expect(calls.at(-1).args).toContain('scripts/electron-sqlite-runner.mjs');
  });
});
