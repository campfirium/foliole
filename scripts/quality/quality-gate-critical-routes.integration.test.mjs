// @vitest-environment node
/* global process */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  QUALITY_GATE_FAST_SCRIPT, runManagedCommand, runQualityGate, toFixtureShellPath
} from './quality-gate-fast.test-support.mjs';

const execFileAsync = promisify(execFile);

function expectedVitestArgs(prefix, testFile) {
  const maxWorkers = process.env.VITEST_MAX_WORKERS?.trim() || '2';
  const fileParallelism = process.env.VITEST_FILE_PARALLELISM?.trim();
  if (process.env.VITEST_MAX_WORKERS?.trim()) {
    const fileParallelArg = fileParallelism === '1' || fileParallelism === 'true' ? '' : ' --no-file-parallelism';
    return `${prefix}run --reporter=dot --reporter=json --outputFile.json=.tmp/vitest/related.json --maxWorkers=${maxWorkers}${fileParallelArg} --silent=passed-only --pool=threads ${testFile}`;
  }
  return `${prefix}run --reporter=dot --reporter=json --outputFile.json=.tmp/vitest/related.json --silent=passed-only --pool=threads --maxWorkers=${maxWorkers} --no-file-parallelism ${testFile}`;
}

async function writeFileWithDirs(root, relativePath, content, mode) {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, mode ? { encoding: 'utf8', mode } : 'utf8');
}

describe('quality gate critical routes integration', () => {
  it('routes staged and unstaged deletions while keeping an existing sibling test', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-critical-routes-'));
    try {
      await writeFile(path.join(root, 'package.json'), '{}\n');
      await writeFileWithDirs(root, 'scripts/quality/quality-critical-test-routes.mjs',
        'process.exit(0);\n');
      await writeFileWithDirs(root, 'src/example/staged.ts', 'export {};\n');
      await writeFileWithDirs(root, 'src/example/unstaged.ts', 'export {};\n');
      await writeFileWithDirs(root, 'src/example/staged.test.ts', 'export {};\n');
      await writeFileWithDirs(root, 'src/example/unstaged.test.ts', 'export {};\n');
      await execFileAsync('git', ['init'], { cwd: root });
      await execFileAsync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
      await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root });
      await execFileAsync('git', ['add', '.'], { cwd: root });
      await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: root });
      await rm(path.join(root, 'src/example/staged.ts'));
      await execFileAsync('git', ['add', 'src/example/staged.ts'], { cwd: root });
      await rm(path.join(root, 'src/example/unstaged.ts'));

      const result = await runQualityGate(root, {}, ['--route-json']);

      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        changedFiles: ['src/example/staged.ts', 'src/example/unstaged.ts'],
        lintTargets: [],
        relatedTests: ['src/example/staged.test.ts', 'src/example/unstaged.test.ts']
      });
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, 90000);

  it('propagates a critical resolver failure from route-json planning', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-critical-routes-'));
    try {
      await writeFile(path.join(root, 'package.json'), '{}\n');
      await writeFileWithDirs(root, 'scripts/quality/quality-critical-test-routes.mjs',
        'console.error("resolver failed"); process.exit(7);\n');
      const result = await runQualityGate(root, {
        QUALITY_GATE_CHANGED_FILES: 'src/example/source.ts'
      }, ['--route-json']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('resolver failed');
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('fails route planning when the critical resolver is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-critical-routes-'));
    try {
      await writeFile(path.join(root, 'package.json'), '{}\n');
      const result = await runQualityGate(root, {
        QUALITY_GATE_CHANGED_FILES: 'src/example/source.ts'
      }, ['--route']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('critical test resolver is missing');
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('runs an overlapping critical and related test once on a heavy route', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-critical-routes-'));
    const testMarker = path.join(root, 'test.marker');
    const env = {
      QUALITY_GATE_CHANGED_FILES: 'src/shared/platform/example.ts',
      npm_execpath: process.env.npm_execpath
    };
    try {
      await writeFile(path.join(root, 'package.json'), JSON.stringify({
        scripts: {
          'deps:scan': 'node -e "console.log(\'dependency declarations ok\')"',
          'typecheck:shared': 'node -e "console.log(\'shared typecheck ok\')"'
        }
      }));
      await writeFileWithDirs(
        root,
        'scripts/quality/quality-critical-test-routes.mjs',
        `import { appendFileSync } from 'node:fs';
if (process.argv.includes('--run')) {
  appendFileSync(${JSON.stringify(testMarker)}, 'run\\n');
} else {
  process.stdout.write('src/shared/platform/example.test.ts\\n');
}
`
      );
      await writeFileWithDirs(root, 'src/shared/platform/example.ts', 'export {};\n');
      await writeFileWithDirs(root, 'src/shared/platform/example.test.ts', 'export {};\n');
      await writeFileWithDirs(
        root,
        'scripts/test-files.mjs',
        `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(testMarker)}, 'run\\n');\n`
      );
      await writeFileWithDirs(root, 'node_modules/eslint/bin/eslint.js', 'process.exit(0);\n');

      const result = await runQualityGate(root, env);

      expect(result.code, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
      expect((await readFile(testMarker, 'utf8')).trim().split('\n')).toEqual(['run']);

      await rm(testMarker, { force: true });
      const oldRunner = path.join(root, 'old-quality-gate-fast.sh');
      await writeFile(oldRunner, [
        'printf \'%s\\n\' "${QUALITY_GATE_CHANGED_FILES}" | node scripts/quality/quality-critical-test-routes.mjs --run',
        `bash ${JSON.stringify(QUALITY_GATE_FAST_SCRIPT)}`
      ].join('\n'));
      const oldResult = await runManagedCommand('bash', [oldRunner], {
        cwd: root,
        env,
        label: 'quality-gate-critical-routes-old-control'
      });

      expect(oldResult.code).toBe(0);
      expect((await readFile(testMarker, 'utf8')).trim().split('\n')).toEqual(['run', 'run']);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, 180000);

  it('keeps critical tests in the plan for non-source triggers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-critical-routes-'));
    try {
      await writeFile(path.join(root, 'package.json'), '{}\n');
      await writeFileWithDirs(
        root,
        'scripts/quality/quality-critical-test-routes.mjs',
        'process.stdout.write("scripts/quality/pinned-npm.test.mjs\\n");\n'
      );
      await writeFileWithDirs(root, 'scripts/quality/pinned-npm.test.mjs', 'export {};\n');

      const result = await runQualityGate(root, {
        QUALITY_GATE_CHANGED_FILES: 'package-lock.json'
      }, ['--route']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-route]   scripts/quality/pinned-npm.test.mjs');
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('runs critical routed tests for backlinks contract changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-critical-routes-'));
    const lintMarker = toFixtureShellPath(path.join(root, 'lint.marker'));
    try {
      await writeFile(
        path.join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
            'deps:scan': 'node -e "console.log(\'dependency declarations ok\')"',
            typecheck: 'node -e "console.log(\'typecheck ok\')"'
          }
        }),
        'utf8'
      );
      await writeFileWithDirs(
        root,
        'scripts/quality/quality-critical-test-routes.mjs',
        'process.stdout.write("src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx\\n");\n'
      );
      await writeFileWithDirs(root, 'src/app/components/useNodeBacklinks.ts', 'export {};\n');
      await writeFileWithDirs(root, 'src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx', 'export {};\n');
      await writeFileWithDirs(
        root,
        'node_modules/.bin/eslint',
        `#!/usr/bin/env bash\nprintf '%s\n' "$*" > "${lintMarker}"\n`,
        0o755
      );
      await writeFileWithDirs(
        root,
        'node_modules/.bin/vitest.mjs',
        'console.log(`critical test:${process.argv.slice(2).join(" ")}`);\n'
      );

      const result = await runQualityGate(root, {
        PATH: `${toFixtureShellPath(path.join(root, 'node_modules/.bin'))}:${process.env.PATH}`,
        VITEST_BIN: path.join(root, 'node_modules/.bin', 'vitest.mjs'),
        QUALITY_GATE_CHANGED_FILES: 'src/app/components/useNodeBacklinks.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: mid');
      expect(result.stdout).toContain(expectedVitestArgs('critical test:', 'src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx'));
      expect(await readFile(lintMarker, 'utf8')).toContain('src/app/components/useNodeBacklinks.ts');
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, 90000);
});
