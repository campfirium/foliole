// @vitest-environment node
/* global process */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRE_COMMIT_VALIDATION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'pre-commit-validation.mjs');

function runCommand(command, args, cwd) {
  const vitestBinName = process.platform === 'win32' ? 'vitest.cmd' : 'vitest';
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        PATH: `${path.join(cwd, 'node_modules', '.bin')}:${process.env.PATH}`,
        VITEST_BIN: path.join(cwd, 'node_modules', '.bin', vitestBinName)
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

async function createRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'pre-commit-validation-'));
  await runCommand('git', ['init'], repoDir);
  await runCommand('git', ['config', 'user.name', 'Precommit Test'], repoDir);
  await runCommand('git', ['config', 'user.email', 'precommit@example.com'], repoDir);
  await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
  await writeFile(path.join(repoDir, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
  await writeFile(
    path.join(repoDir, 'scripts', 'check-file-budget.mjs'),
    'import { appendFileSync } from "node:fs"; appendFileSync("calls.log", `budget:${process.argv.slice(2).join(",")}\\n`);\n',
    'utf8'
  );
  await writeFile(
    path.join(repoDir, 'scripts', 'lint-changed.sh'),
    '#!/usr/bin/env bash\nprintf "lint:%s\\n" "$*" >> calls.log\n',
    { encoding: 'utf8', mode: 0o755 }
  );
  await writeFile(
    path.join(repoDir, 'scripts', 'quality-critical-test-routes.mjs'),
    'import { readFileSync } from "node:fs"; const files = readFileSync(0, "utf8"); if (files.includes("useNodeBacklinks.ts")) process.stdout.write("src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx\\n");\n',
    'utf8'
  );
  await mkdir(path.join(repoDir, 'node_modules', '.bin'), { recursive: true });
  await writeFile(
    path.join(repoDir, 'node_modules', '.bin', 'vitest'),
    '#!/usr/bin/env bash\nprintf "vitest:%s\\n" "$*" >> calls.log\n',
    { encoding: 'utf8', mode: 0o755 }
  );
  await writeFile(
    path.join(repoDir, 'node_modules', '.bin', 'vitest.cmd'),
    '@echo off\r\necho vitest:%*>> calls.log\r\n',
    'utf8'
  );
  return repoDir;
}

describe('pre-commit validation', () => {
  it('keeps sync-pack tests out of the pre-commit path', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'electron', 'database'), { recursive: true });
      await writeFile(path.join(repoDir, 'electron', 'database', 'syncPackBuilder.ts'), 'export const value = 1;\n');
      await runCommand('git', ['add', '.'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code, result.stderr).toBe(0);
      expect(await readFile(path.join(repoDir, 'calls.log'), 'utf8')).not.toContain('sync-pack');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('runs budget for added files and lints all staged code files', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'src'), { recursive: true });
      await writeFile(path.join(repoDir, 'src', 'existing.ts'), 'export const value = 1;\n');
      await runCommand('git', ['add', 'src/existing.ts'], repoDir);
      await runCommand('git', ['commit', '-m', 'seed'], repoDir);
      await writeFile(path.join(repoDir, 'src', 'existing.ts'), 'export const value = 2;\n');
      await writeFile(path.join(repoDir, 'src', 'new-file.ts'), 'export const value = 1;\n');
      await writeFile(path.join(repoDir, 'notes.md'), '# Notes\n');
      await runCommand('git', ['add', 'src/existing.ts', 'src/new-file.ts', 'notes.md'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code, result.stderr).toBe(0);
      const calls = await readFile(path.join(repoDir, 'calls.log'), 'utf8');
      expect(calls).toContain('budget:notes.md,src/new-file.ts');
      expect(calls).toContain('lint:src/existing.ts src/new-file.ts');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('runs critical routed tests for staged contract changes', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'src', 'app', 'components'), { recursive: true });
      await writeFile(path.join(repoDir, 'src', 'app', 'components', 'useNodeBacklinks.ts'), 'export const value = 1;\n');
      await writeFile(
        path.join(repoDir, 'src', 'app', 'components', 'DocumentPanelSection.runtimeBacklinks.test.tsx'),
        'it("covers backlinks", () => {});\n'
      );
      await writeFile(
        path.join(repoDir, 'src', 'app', 'components', 'WorkspaceRightSidebarBacklinksPanel.test.tsx'),
        'it("covers backlinks", () => {});\n'
      );
      await runCommand('git', ['add', '.'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code, result.stderr).toBe(0);
      const calls = await readFile(path.join(repoDir, 'calls.log'), 'utf8');
      expect(calls).toContain(
        'vitest:run --reporter=dot --reporter=json --outputFile.json=.tmp/vitest/pre-commit-critical.json --silent=passed-only --pool=threads --no-file-parallelism src/app/components/DocumentPanelSection.runtimeBacklinks.test.tsx'
      );
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('blocks contract-sensitive staged changes without test maintenance', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'src', 'app', 'components'), { recursive: true });
      await writeFile(path.join(repoDir, 'src', 'app', 'components', 'StatusPanel.tsx'), 'export const label = "Syncing";\n');
      await runCommand('git', ['add', '.'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('contract-sensitive changes require paired test maintenance');
      expect(result.stderr).toContain('src/app/components/StatusPanel.tsx');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('allows contract-sensitive staged changes with paired test support updates', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'src', 'app', 'components'), { recursive: true });
      await writeFile(path.join(repoDir, 'src', 'app', 'components', 'StatusPanel.tsx'), 'export const label = "Syncing";\n');
      await writeFile(path.join(repoDir, 'src', 'app', 'components', 'StatusPanel.test.tsx'), 'it("covers status", () => {});\n');
      await runCommand('git', ['add', '.'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).toBe(0);
      const calls = await readFile(path.join(repoDir, 'calls.log'), 'utf8');
      expect(calls).toContain('src/app/components/StatusPanel.test.tsx');
      expect(calls).toContain('src/app/components/StatusPanel.tsx');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('blocks fragile inline Windows shell commands from being staged', async () => {
    const repoDir = await createRepo();
    try {
      await writeFile(
        path.join(repoDir, 'package.json'),
        JSON.stringify({
          scripts: {
            'bad:preview': 'powershell.exe -NoProfile -Command "$env:FOO=\'bar\'; cmd.exe /c npm.cmd run electron:dev"'
          }
        }),
        'utf8'
      );
      await runCommand('git', ['add', 'package.json'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('windows shell policy violation');
      expect(result.stderr).toContain('package.json');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('allows Windows native wrappers that delegate to Node runners', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'scripts', 'windows'), { recursive: true });
      await writeFile(
        path.join(repoDir, 'package.json'),
        JSON.stringify({
          scripts: {
            'electron:dev:native': 'node scripts/windows/electron-dev-native.mjs'
          }
        }),
        'utf8'
      );
      await writeFile(
        path.join(repoDir, 'scripts', 'windows', 'electron-dev-native.mjs'),
        'process.env.FOLIOLE_USER_DATA_PATH ??= ".electron-user-data"; await import("../electron-dev.mjs");\n',
        'utf8'
      );
      await runCommand('git', ['add', 'package.json', 'scripts/windows/electron-dev-native.mjs'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).toBe(0);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('does not block edits near legacy Windows shell commands unless the fragile command is newly added', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'scripts', 'windows'), { recursive: true });
      await writeFile(
        path.join(repoDir, 'scripts', 'windows', 'legacy-preview.sh'),
        [
          '#!/usr/bin/env bash',
          'powershell.exe -NoProfile -Command "$env:FOO=\'bar\'; npm.cmd run electron:dev"',
          ''
        ].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await runCommand('git', ['add', '.'], repoDir);
      await runCommand('git', ['commit', '-m', 'seed legacy script'], repoDir);
      await writeFile(
        path.join(repoDir, 'scripts', 'windows', 'legacy-preview.sh'),
        [
          '#!/usr/bin/env bash',
          '# unrelated maintenance note',
          'powershell.exe -NoProfile -Command "$env:FOO=\'bar\'; npm.cmd run electron:dev"',
          ''
        ].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await runCommand('git', ['add', 'scripts/windows/legacy-preview.sh'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code, result.stderr).toBe(0);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
