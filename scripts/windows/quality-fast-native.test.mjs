// @vitest-environment node
/* global console */

import { describe, expect, it, vi } from 'vitest';

import {
  isRejectedBashPath,
  parseQualityFastNativeArgs,
  parseRoutePlan,
  resolveGitBash,
  runQualityT0Native
} from './quality-fast-native.mjs';

const WIN_SEP = String.fromCharCode(92);
const winPath = (...parts) => parts.join(WIN_SEP);
const SYSTEM_BASH = winPath('C:', 'Windows', 'System32', 'bash.exe');
const GIT_BASH = winPath('C:', 'Program Files', 'Git', 'bin', 'bash.exe');
const SCOOP_BASH = winPath('C:', 'Users', 'zephu', 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe');
const NPM_ENV = { npm_execpath: '/npm-cli.js' };

describe('quality-fast-native route parsing', () => {
  it('rejects removed aggregate overrides and mixed route modes', () => {
    expect(parseQualityFastNativeArgs([])).toBe('run');
    expect(parseQualityFastNativeArgs(['--route'])).toBe('route');
    expect(parseQualityFastNativeArgs(['--route-json'])).toBe('route-json');
    expect(() => parseQualityFastNativeArgs(['--full'])).toThrow('aggregate quality is hosted-only');
    expect(() => parseQualityFastNativeArgs(['--release'])).toThrow('aggregate quality is hosted-only');
    expect(() => parseQualityFastNativeArgs(['--route', '--route-json'])).toThrow('accepts only');
  });

  it('parses heavy route details from the shared route plan output', () => {
    const plan = parseRoutePlan([
      '[quality-gate-route] selected level: desktop',
      '[quality-gate-route] reason: desktop runtime changed',
      '[quality-gate-route] target: quality:desktop',
      '[quality-gate-route] changed files:',
      '[quality-gate-route]   electron/main.ts',
      '[quality-gate-route] lint targets:',
      '[quality-gate-route]   electron/main.ts',
      '[quality-gate-route] related tests:',
      '[quality-gate-route]   electron/main.test.ts'
    ].join('\n'));

    expect(plan).toEqual({
      changedFiles: ['electron/main.ts'],
      level: 'desktop',
      lintTargets: ['electron/main.ts'],
      relatedTests: ['electron/main.test.ts'],
      target: 'quality:desktop'
    });
  });

  it('drops "none" placeholders from optional route sections', () => {
    const plan = parseRoutePlan([
      '[quality-gate-route] selected level: light',
      '[quality-gate-route] target: scoped lint + typecheck',
      '[quality-gate-route] changed files: none',
      '[quality-gate-route] lint targets: none',
      '[quality-gate-route] related tests: none'
    ].join('\n'));

    expect(plan.changedFiles).toEqual([]);
    expect(plan.lintTargets).toEqual([]);
    expect(plan.relatedTests).toEqual([]);
  });
});

describe('quality-fast-native Git Bash resolution', () => {
  it('rejects Windows system bash and wsl executables', () => {
    expect(isRejectedBashPath(SYSTEM_BASH)).toBe(true);
    expect(isRejectedBashPath('C:/Windows/System32/wsl.exe')).toBe(true);
    expect(isRejectedBashPath(SCOOP_BASH)).toBe(false);
  });

  it('fails fast when an explicit bash points at WSL bash', () => {
    expect(() => resolveGitBash({ FOLIOLE_GIT_BASH: SYSTEM_BASH })).toThrow(
      /Git Bash not found/u
    );
  });
});

describe('quality-fast-native T0 routing', () => {
  it('requests deleted paths from the shared collector for quality routing', async () => {
    const resolveChangedFiles = vi.fn(async () => ['src/app/deleted.ts']);
    const plan = await runQualityT0Native({
      bashExe: GIT_BASH, env: NPM_ENV,
      plan: { changedFiles: ['src/app/deleted.ts'], level: 'light', lintTargets: [], relatedTests: [] },
      planOnly: true, resolveChangedFiles
    });
    expect(resolveChangedFiles).toHaveBeenCalledWith(expect.any(String), ['.'], { includeDeletes: true });
    expect(plan.changedFiles).toContain('src/app/deleted.ts');
  });

  it('returns the route plan without running checks for route-json mode', async () => {
    const plan = { changedFiles: ['electron/main.ts'], level: 'desktop', lintTargets: [], relatedTests: [], target: 'quality:desktop' };
    const runner = vi.fn(async () => 0);

    await expect(runQualityT0Native({ bashExe: GIT_BASH, changedFiles: plan.changedFiles, env: NPM_ENV, plan, planOnly: true, runner }))
      .resolves.toEqual(plan);
    expect(runner).not.toHaveBeenCalled();
  });

  it('runs light and mid routes through the native local steps with changed files', async () => {
    const calls = [];
    await runQualityT0Native({
      bashExe: GIT_BASH,
      changedFiles: ['src/app/App.tsx'],
      env: NPM_ENV,
      plan: { changedFiles: ['src/app/App.tsx'], level: 'light', lintTargets: [], relatedTests: [], target: 'scoped lint + typecheck' },
      runner: async (command, args, options) => {
        calls.push({ args, command, env: options.env, label: options.label });
        return 0;
      }
    });

    expect(calls.some((call) => call.command === GIT_BASH)).toBe(false);
    expect(calls.map((call) => call.label)).toContain('typecheck');
    expect(calls.every((call) => call.env.QUALITY_GATE_CHANGED_FILES === 'src/app/App.tsx')).toBe(true);
  });

  it('uses QUALITY_GATE_CHANGED_FILES as the native changed-file override', async () => {
    const calls = [];
    await runQualityT0Native({
      bashExe: GIT_BASH,
      env: { QUALITY_GATE_CHANGED_FILES: 'src/app/App.tsx' },
      plan: { changedFiles: ['src/app/App.tsx'], level: 'light', lintTargets: [], relatedTests: [], target: 'scoped lint + typecheck' },
      runner: async (command, args, options) => {
        calls.push({ args, command, env: options.env, label: options.label });
        return 0;
      }
    });

    expect(calls.every((call) => call.env.QUALITY_GATE_CHANGED_FILES === 'src/app/App.tsx')).toBe(true);
  });

  it('caps desktop routes to T0 commands and defers the T0 follow-up gate', async () => {
    const calls = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runQualityT0Native({
        bashExe: GIT_BASH,
        changedFiles: ['electron/main.ts'],
        env: NPM_ENV,
        plan: {
          changedFiles: ['electron/main.ts'],
          level: 'desktop',
          lintTargets: ['electron/main.ts'],
          relatedTests: ['electron/main.test.ts', 'src/app/App.test.tsx'],
          target: 'quality:desktop'
        },
        runner: async (command, args, options) => {
          calls.push({ args, command, label: options.label });
          return 0;
        }
      });
      expect(logSpy).toHaveBeenCalledWith(
        '[quality-fast-native] desktop-class change detected -> hosted quality deferred to scheduled T7 Hosted Quality; Remote Quality is reserved for repair or explicit rechecks on dev, while releases use T7 Release.'
      );
    } finally {
      logSpy.mockRestore();
    }

    expect(calls.map((call) => call.label)).toEqual([
      'specialized surface usage',
      'repository root boundary',
      'deps:scan',
      'scoped lint',
      'typecheck:desktop',
      'related tests',
      'electron related tests'
    ]);
    expect(calls.some((call) => call.args.includes('quality-gate-target.sh'))).toBe(false);
  });

  it('runs controlled sqlite tests through the Electron ABI runner even outside electron paths', async () => {
    const calls = [];
    await runQualityT0Native({
      bashExe: GIT_BASH,
      changedFiles: ['src/shared/platform/companionSyncNodeVersions.ts'],
      env: NPM_ENV,
      plan: {
        changedFiles: ['src/shared/platform/companionSyncNodeVersions.ts'],
        level: 'shared',
        lintTargets: [],
        relatedTests: [
          'src/shared/platform/companionSyncNodeVersions.test.ts',
          'src/shared/platform/plainHelper.test.ts'
        ],
        target: 'quality:shared'
      },
      runner: async (command, args, options) => {
        calls.push({ args, command, label: options.label });
        return 0;
      }
    });

    const ordinary = calls.find((call) => call.label === 'related tests');
    const electron = calls.find((call) => call.label === 'electron related tests');
    expect(ordinary.args).toContain('src/shared/platform/plainHelper.test.ts');
    expect(electron.args).toContain('scripts/electron-sqlite-runner.mjs');
    expect(electron.args).toContain('src/shared/platform/companionSyncNodeVersions.test.ts');
  });

  it.each([
    ['shared', ['specialized surface usage', 'repository root boundary', 'deps:scan', 'typecheck:shared'], 'quality:shared'],
    ['android', ['specialized surface usage', 'repository root boundary', 'deps:scan', 'typecheck:android'], 'quality:android'],
    ['ios', ['specialized surface usage', 'repository root boundary', 'deps:scan'], 'quality:ios:contract'],
    [
      'full',
      ['specialized surface usage', 'repository root boundary', 'deps:scan', 'typecheck:desktop', 'typecheck:shared', 'typecheck:android'],
      'quality:full'
    ]
  ])('caps %s routes and reports the deferred comprehensive gate', async (level, expectedTypechecks, deferredGate) => {
    const calls = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runQualityT0Native({
        bashExe: GIT_BASH,
        changedFiles: ['src/shared/platform/example.ts'],
        env: NPM_ENV,
        plan: {
          changedFiles: ['src/shared/platform/example.ts'],
          level,
          lintTargets: [],
          relatedTests: [],
          target: deferredGate
        },
        runner: async (command, args, options) => {
          calls.push({ args, command, label: options.label });
          return 0;
        }
      });
      expect(logSpy).toHaveBeenCalledWith(
        `[quality-fast-native] ${level}-class change detected -> hosted quality deferred to scheduled T7 Hosted Quality; Remote Quality is reserved for repair or explicit rechecks on dev, while releases use T7 Release.`
      );
    } finally {
      logSpy.mockRestore();
    }

    expect(calls.map((call) => call.label)).toEqual(expectedTypechecks);
  });
});
