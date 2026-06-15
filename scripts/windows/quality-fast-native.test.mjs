// @vitest-environment node
/* global console */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { isRejectedBashPath, parseRoutePlan, resolveGitBash, runQualityL0Native } from './quality-fast-native.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

it('exposes a Windows native fast quality npm entry', async () => {
  const packageJson = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));

  expect(packageJson.scripts['quality:fast:native']).toBe('node scripts/windows/quality-fast-native.mjs');
});

describe('quality-fast-native route parsing', () => {
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
    expect(isRejectedBashPath('C:\\Windows\\System32\\bash.exe')).toBe(true);
    expect(isRejectedBashPath('C:/Windows/System32/wsl.exe')).toBe(true);
    expect(isRejectedBashPath('C:\\Users\\zephu\\scoop\\apps\\git\\current\\bin\\bash.exe')).toBe(false);
  });

  it('fails fast when an explicit bash points at WSL bash', () => {
    expect(() => resolveGitBash({ FOLIOLE_GIT_BASH: 'C:\\Windows\\System32\\bash.exe' })).toThrow(
      /Git Bash not found/u
    );
  });
});

describe('quality-fast-native L0 routing', () => {
  it('runs light and mid routes through the native local steps with changed files', async () => {
    const calls = [];
    await runQualityL0Native({
      bashExe: 'C:\\Program Files\\Git\\bin\\bash.exe',
      changedFiles: ['src/app/App.tsx'],
      env: {},
      plan: { changedFiles: ['src/app/App.tsx'], level: 'light', lintTargets: [], relatedTests: [], target: 'scoped lint + typecheck' },
      runner: async (command, args, options) => {
        calls.push({ args, command, env: options.env, label: options.label });
        return 0;
      }
    });

    expect(calls.some((call) => call.command === 'C:\\Program Files\\Git\\bin\\bash.exe')).toBe(false);
    expect(calls.map((call) => call.label)).toContain('typecheck');
    expect(calls.every((call) => call.env.QUALITY_GATE_CHANGED_FILES === 'src/app/App.tsx')).toBe(true);
  });

  it('uses QUALITY_GATE_CHANGED_FILES as the native changed-file override', async () => {
    const calls = [];
    await runQualityL0Native({
      bashExe: 'C:\\Program Files\\Git\\bin\\bash.exe',
      env: { QUALITY_GATE_CHANGED_FILES: 'src/app/App.tsx' },
      plan: { changedFiles: ['src/app/App.tsx'], level: 'light', lintTargets: [], relatedTests: [], target: 'scoped lint + typecheck' },
      runner: async (command, args, options) => {
        calls.push({ args, command, env: options.env, label: options.label });
        return 0;
      }
    });

    expect(calls.every((call) => call.env.QUALITY_GATE_CHANGED_FILES === 'src/app/App.tsx')).toBe(true);
  });

  it('caps desktop routes to L0 commands and defers the L0.5 comprehensive gate', async () => {
    const calls = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runQualityL0Native({
        bashExe: 'C:\\Program Files\\Git\\bin\\bash.exe',
        changedFiles: ['electron/main.ts'],
        env: {},
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
        '[quality-fast-native] desktop-class change detected -> L0.5 comprehensive gate deferred: npm run quality:desktop'
      );
    } finally {
      logSpy.mockRestore();
    }

    expect(calls.map((call) => call.label)).toEqual([
      'scoped lint',
      'typecheck:desktop',
      'related tests',
      'electron related tests'
    ]);
    expect(calls.some((call) => call.args.includes('quality-gate-target.sh'))).toBe(false);
  });

  it('runs controlled sqlite tests through the Electron ABI runner even outside electron paths', async () => {
    const calls = [];
    await runQualityL0Native({
      bashExe: 'C:\\Program Files\\Git\\bin\\bash.exe',
      changedFiles: ['src/shared/platform/companionSyncNodeVersions.ts'],
      env: {},
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
    ['shared', ['typecheck:shared'], 'quality:shared'],
    ['android', ['typecheck:android'], 'quality:android'],
    ['full', ['typecheck:desktop', 'typecheck:shared', 'typecheck:android'], 'quality:full']
  ])('caps %s routes and reports the deferred comprehensive gate', async (level, expectedTypechecks, deferredGate) => {
    const calls = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runQualityL0Native({
        bashExe: 'C:\\Program Files\\Git\\bin\\bash.exe',
        changedFiles: ['src/shared/platform/example.ts'],
        env: {},
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
        `[quality-fast-native] ${level}-class change detected -> L0.5 comprehensive gate deferred: npm run ${deferredGate}`
      );
    } finally {
      logSpy.mockRestore();
    }

    expect(calls.map((call) => call.label)).toEqual(expectedTypechecks);
  });
});
