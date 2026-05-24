// @vitest-environment node
/* global process */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh');

function runQualityGate(cwd, env = {}, args = []) {
  return new Promise((resolve) => {
    const child = spawn('bash', [QUALITY_GATE_FAST_SCRIPT, ...args], {
      cwd,
      env: { ...process.env, QUALITY_GATE_LOG_MODE: 'summary', ...env }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => resolve({ code, stderr, stdout }));
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
    const lintMarker = path.join(root, 'lint.marker');
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
        'scripts/quality-critical-test-routes.mjs',
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
        'node_modules/.bin/vitest',
        '#!/usr/bin/env bash\necho "critical test:$*"\n',
        0o755
      );

      const result = await runQualityGate(root, {
        PATH: `${path.join(root, 'node_modules/.bin')}:${process.env.PATH}`,
        VITEST_BIN: path.join(root, 'node_modules/.bin', 'vitest'),
        QUALITY_GATE_CHANGED_FILES: 'src/app/components/useNodeBacklinks.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: mid');
      expect(result.stdout).toContain('critical test:run --reporter=dot --reporter=json --outputFile.json=.tmp/vitest/related.json --silent=passed-only --pool=threads --maxWorkers=2 --no-file-parallelism src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx');
      expect(await readFile(lintMarker, 'utf8')).toContain('src/app/components/useNodeBacklinks.ts');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
