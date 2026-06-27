// @vitest-environment node
/* global process */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runManagedCommand, toFixtureShellPath } from './quality-gate-fast.test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-fast.sh');

function expectedVitestArgs(prefix, testFile) {
  const maxWorkers = process.env.VITEST_MAX_WORKERS?.trim() || '2';
  const fileParallelism = process.env.VITEST_FILE_PARALLELISM?.trim();
  if (process.env.VITEST_MAX_WORKERS?.trim()) {
    const fileParallelArg = fileParallelism === '1' || fileParallelism === 'true' ? '' : ' --no-file-parallelism';
    return `${prefix}run --reporter=dot --reporter=json --outputFile.json=.tmp/vitest/related.json --maxWorkers=${maxWorkers}${fileParallelArg} --silent=passed-only --pool=threads ${testFile}`;
  }
  return `${prefix}run --reporter=dot --reporter=json --outputFile.json=.tmp/vitest/related.json --silent=passed-only --pool=threads --maxWorkers=${maxWorkers} --no-file-parallelism ${testFile}`;
}

function runQualityGate(cwd, env = {}, args = []) {
  return runManagedCommand('bash', [QUALITY_GATE_FAST_SCRIPT, ...args], {
    cwd,
    env,
    label: 'quality-gate-critical-routes',
    timeoutMs: 20_000
  });
}

async function writeFileWithDirs(root, relativePath, content, mode) {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, mode ? { encoding: 'utf8', mode } : 'utf8');
}

describe('quality gate critical routes integration', () => {
  it('runs critical routed tests for backlinks contract changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-critical-routes-'));
    const lintMarker = toFixtureShellPath(path.join(root, 'lint.marker'));
    try {
      await writeFile(
        path.join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
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
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
});
