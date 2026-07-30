// @vitest-environment node

import { rm } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  createQualityGateTempRoot,
  runQualityGate,
  writeFixtureFile,
  writePackageJson
} from './quality-gate-fast.test-support.mjs';

vi.setConfig({ testTimeout: 60000 });

const NATIVE_STATIC_TRIGGER = [
  'lib/platform/nativeSplitTopicPreferencesContract.ts',
  'src/shared/platform/splitTopicPreferences.ts'
];

const HEAVY_ROUTES = [
  {
    level: 'desktop',
    changedFiles: ['electron/ipc/splitTopicPreferencesCommands.ts', ...NATIVE_STATIC_TRIGGER],
    expectedTypechecks: ['desktop typecheck ok']
  },
  {
    level: 'shared',
    changedFiles: NATIVE_STATIC_TRIGGER,
    expectedTypechecks: ['shared typecheck ok']
  },
  {
    level: 'full',
    changedFiles: ['package.json', 'electron/ipc/splitTopicPreferencesCommands.ts', ...NATIVE_STATIC_TRIGGER],
    expectedTypechecks: ['desktop typecheck ok', 'shared typecheck ok', 'android typecheck ok']
  }
];

const GUARD_FAILURES = HEAVY_ROUTES.flatMap((route) => [
  { ...route, guard: 'native' },
  { ...route, guard: 'layer' }
]);

async function writeStaticGuardFixture(tempRoot, changedFiles, failingGuard) {
  const nativeGuardFails = failingGuard === 'native' || failingGuard === 'both';
  const layerGuardFails = failingGuard === 'layer' || failingGuard === 'both';
  await writePackageJson(tempRoot, {
    'check:native-contracts': nativeGuardFails
      ? 'node -e "console.error(\'native contracts blocked\'); process.exit(1)"'
      : 'node -e "console.log(\'native contracts ok\')"',
    'copy:guard': 'node -e "console.log(\'copy guard should stay unused\')"',
    'native-dialog:guard': 'node -e "console.log(\'native dialog guard should stay unused\')"',
    'windows:console:guard': 'node -e "console.log(\'console guard should stay unused\')"',
    'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
    'typecheck:shared': 'node -e "console.log(\'shared typecheck ok\')"',
    'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"'
  });
  await writeFixtureFile(
    tempRoot,
    'scripts/check-native-command-contracts.mjs',
    'throw new Error("package script must own native contract execution");\n'
  );
  await writeFixtureFile(
    tempRoot,
    'scripts/check-layer-dependency-boundary.mjs',
    layerGuardFails
      ? 'console.error("layer boundary blocked"); process.exit(1);\n'
      : 'console.log("layer boundary ok");\n'
  );
  for (const checker of [
    'scripts/check-ui-copy-guard.mjs',
    'scripts/check-native-dialog-guard.mjs',
    'scripts/check-windows-console-policy.mjs'
  ]) await writeFixtureFile(tempRoot, checker, 'export {};\n');
  await writeFixtureFile(tempRoot, 'node_modules/eslint/bin/eslint.js', 'console.log("scoped lint ok");\n');
  for (const changedFile of changedFiles) {
    if (changedFile !== 'package.json') await writeFixtureFile(tempRoot, changedFile, 'export {};\n');
  }
}

describe('quality-gate-fast.sh global static guards', () => {
  it.each(HEAVY_ROUTES)('keeps $level capped routes behind native and layer guards', async ({
    level, changedFiles, expectedTypechecks
  }) => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writeStaticGuardFixture(tempRoot, changedFiles);
      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: changedFiles.join('\n')
      });

      expect(result.code, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(`[quality-gate-fast] selected level: ${level}`);
      expect(result.stdout.match(/native contracts ok/gu) ?? []).toHaveLength(1);
      expect(result.stdout.match(/layer boundary ok/gu) ?? []).toHaveLength(1);
      for (const marker of expectedTypechecks) expect(result.stdout).toContain(marker);
      expect(result.stdout).toContain('[quality-gate-fast] capped local checks passed.');
      expect(result.stdout).not.toContain('should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it.each(GUARD_FAILURES)('stops $level capped routes when the $guard guard fails', async ({
    changedFiles, expectedTypechecks, guard
  }) => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writeStaticGuardFixture(tempRoot, changedFiles, guard);
      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: changedFiles.join('\n')
      });
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.code).not.toBe(0);
      expect(output).toContain(`${guard === 'native' ? 'native contracts' : 'layer boundary'} blocked`);
      for (const marker of expectedTypechecks) expect(output).not.toContain(marker);
      expect(output).not.toContain('[quality-gate-fast] capped local checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it.each(['--route', '--route-json'])('keeps %s planning free of static-guard execution', async (arg) => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      const changedFiles = HEAVY_ROUTES[0].changedFiles;
      await writeStaticGuardFixture(tempRoot, changedFiles, 'both');
      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: changedFiles.join('\n')
      }, [arg]);

      expect(result.code, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
      if (arg === '--route-json') expect(JSON.parse(result.stdout)).toMatchObject({ level: 'desktop' });
      else expect(result.stdout).toContain('[quality-gate-route] selected level: desktop');
      expect(`${result.stdout}\n${result.stderr}`).not.toContain('blocked');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
