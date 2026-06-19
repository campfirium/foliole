// @vitest-environment node
/* global process */

import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createQualityGateTempRoot,
  runQualityGate,
  toFixtureShellPath,
  writeExecutable,
  writeFixtureFile,
  writePackageJson
} from './quality-gate-fast.test-support.mjs';

function expectedVitestArgs(prefix, testFile) {
  const maxWorkers = process.env.VITEST_MAX_WORKERS?.trim() || '2';
  const fileParallelism = process.env.VITEST_FILE_PARALLELISM?.trim();
  if (process.env.VITEST_MAX_WORKERS?.trim()) {
    const fileParallelArg = fileParallelism === '1' || fileParallelism === 'true' ? '' : ' --no-file-parallelism';
    return `${prefix}run --reporter=dot --reporter=json --outputFile.json=.tmp/vitest/related.json --maxWorkers=${maxWorkers}${fileParallelArg} --silent=passed-only --pool=threads ${testFile}`;
  }
  return `${prefix}run --reporter=dot --reporter=json --outputFile.json=.tmp/vitest/related.json --silent=passed-only --pool=threads --maxWorkers=${maxWorkers} --no-file-parallelism ${testFile}`;
}

describe('quality-gate-fast.sh routing', () => {
  it('uses the light level for local component changes and skips related tests', async () => {
    const tempRoot = await createQualityGateTempRoot();
    const typecheckMarker = toFixtureShellPath(path.join(tempRoot, 'typecheck.marker'));
    const lintMarker = toFixtureShellPath(path.join(tempRoot, 'lint.marker'));
    try {
      await writePackageJson(tempRoot, {
        'copy:guard': 'node scripts/check-ui-copy-guard.mjs',
        lint: 'node -e "console.log(\'repo lint should stay unused\')"',
        typecheck: `node -e "require('node:fs').writeFileSync('${typecheckMarker}', 'ok')"`,
        test: 'node -e "console.log(\'repo test should stay unused\')"',
        build: 'node -e "console.log(\'repo build should stay unused\')"'
      });
      await writeFixtureFile(tempRoot, 'scripts/check-ui-copy-guard.mjs', 'console.log("copy guard ok");\n');
      await writeFixtureFile(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'console.log("repository root boundary ok");\n');
      await writeExecutable(tempRoot, 'node_modules/.bin/eslint', `#!/usr/bin/env bash\nprintf '%s\n' "$*" > "${lintMarker}"\n`);
      await writeFixtureFile(
        tempRoot,
        'src/features/image-cloze/components/ImageClozeCardView.tsx',
        'export function ImageClozeCardView() { return null; }\n'
      );

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'src/features/image-cloze/components/ImageClozeCardView.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: light');
      expect(result.stdout).toContain('copy guard ok');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(await readFile(lintMarker, 'utf8')).toContain('src/features/image-cloze/components/ImageClozeCardView.tsx');
      expect(await readFile(typecheckMarker, 'utf8')).toBe('ok');
      expect(result.stdout).not.toContain('repo lint should stay unused');
      expect(result.stdout).not.toContain('repo test should stay unused');
      expect(result.stdout).not.toContain('repo build should stay unused');
      expect(result.stdout).not.toContain('test (related)');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('prints a route plan without running checks', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'repo lint should stay unused\')"',
        typecheck: 'node -e "console.log(\'typecheck should stay unused\')"'
      });
      await writeFixtureFile(
        tempRoot,
        'src/features/image-cloze/components/ImageClozeCardView.tsx',
        'export function ImageClozeCardView() { return null; }\n'
      );

      const result = await runQualityGate(
        tempRoot,
        { QUALITY_GATE_CHANGED_FILES: 'src/features/image-cloze/components/ImageClozeCardView.tsx' },
        ['--explain', '--route']
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-route] selected level: light');
      expect(result.stdout).toContain('[quality-gate-route] reason: local source change');
      expect(result.stdout).toContain('[quality-gate-route] target: scoped lint + typecheck');
      expect(result.stdout).toContain('[quality-gate-route] lint targets:');
      expect(result.stdout).toContain('src/features/image-cloze/components/ImageClozeCardView.tsx');
      expect(result.stdout).toContain('[quality-gate-route] related tests: none');
      expect(result.stdout).not.toContain('repo lint should stay unused');
      expect(result.stdout).not.toContain('typecheck should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('uses the mid level for props signature changes and runs related tests', async () => {
    const tempRoot = await createQualityGateTempRoot();
    const typecheckMarker = toFixtureShellPath(path.join(tempRoot, 'typecheck.marker'));
    const lintMarker = toFixtureShellPath(path.join(tempRoot, 'lint.marker'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'repo lint should stay unused\')"',
        typecheck: `node -e "require('node:fs').writeFileSync('${typecheckMarker}', 'ok')"`,
        test: 'node -e "console.log(\'repo test should stay unused\')"',
        build: 'node -e "console.log(\'repo build should stay unused\')"'
      });
      await writeFixtureFile(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'console.log("repository root boundary ok");\n');
      await writeExecutable(tempRoot, 'node_modules/.bin/eslint', `#!/usr/bin/env bash\nprintf '%s\n' "$*" > "${lintMarker}"\n`);
      await writeFixtureFile(
        tempRoot,
        'node_modules/.bin/vitest.mjs',
        'console.log(`related test:${process.argv.slice(2).join(" ")}`);\n'
      );
      await writeFixtureFile(
        tempRoot,
        'src/app/components/FancyCard.tsx',
        'export interface FancyCardProps { title: string }\nexport function FancyCard(_props: FancyCardProps) { return null; }\n'
      );
      await writeFixtureFile(tempRoot, 'src/app/components/FancyCard.test.tsx', 'export {};\n');

      const result = await runQualityGate(tempRoot, {
        PATH: `${toFixtureShellPath(path.join(tempRoot, 'node_modules/.bin'))}:${process.env.PATH}`,
        VITEST_BIN: path.join(tempRoot, 'node_modules/.bin', 'vitest.mjs'),
        QUALITY_GATE_CHANGED_FILES: 'src/app/components/FancyCard.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: mid');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(await readFile(lintMarker, 'utf8')).toContain('src/app/components/FancyCard.tsx');
      expect(await readFile(typecheckMarker, 'utf8')).toBe('ok');
      expect(result.stdout).toContain(expectedVitestArgs('related test:', 'src/app/components/FancyCard.test.tsx'));
      expect(result.stdout).not.toContain('repo lint should stay unused');
      expect(result.stdout).not.toContain('repo test should stay unused');
      expect(result.stdout).not.toContain('repo build should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('prints related tests for mid-level route plans', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'repo lint should stay unused\')"',
        typecheck: 'node -e "console.log(\'typecheck should stay unused\')"'
      });
      await writeFixtureFile(
        tempRoot,
        'src/app/components/FancyCard.tsx',
        'export interface FancyCardProps { title: string }\nexport function FancyCard(_props: FancyCardProps) { return null; }\n'
      );
      await writeFixtureFile(tempRoot, 'src/app/components/FancyCard.test.tsx', 'export {};\n');

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'src/app/components/FancyCard.tsx'
      }, ['--route']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-route] selected level: mid');
      expect(result.stdout).toContain('exported component surface or props/type signature changed');
      expect(result.stdout).toContain('[quality-gate-route] target: scoped lint + typecheck + workspace boundary + related tests');
      expect(result.stdout).toContain('src/app/components/FancyCard.test.tsx');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
