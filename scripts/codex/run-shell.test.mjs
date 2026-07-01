/* global process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const thisFile = fileURLToPath(import.meta.url);
const codexDir = path.dirname(thisFile);
const repoRoot = path.resolve(codexDir, '..', '..');
const tempDirs = [];
const bashCommand = resolveBashCommand();

vi.setConfig({ testTimeout: 60000 });

const scripts = [
  {
    shellFile: 'run-task.sh',
    moduleFile: 'codex-task.mjs',
    prefix: '[codex-task]'
  },
  {
    shellFile: 'run-loop.sh',
    moduleFile: 'codex-loop.mjs',
    prefix: '[codex-loop]'
  }
];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function writeStub(binDir, name, body) {
  const filePath = path.join(binDir, name);
  fs.writeFileSync(filePath, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  fs.chmodSync(filePath, 0o755);
}

function resolveBashCommand() {
  if (process.platform === 'win32') {
    const scoopBash = path.join(os.homedir(), 'scoop', 'shims', 'bash.exe');
    if (fs.existsSync(scoopBash)) {
      return scoopBash;
    }
    const result = spawnSync('where.exe', ['bash'], { encoding: 'utf8' });
    const matches = result.stdout.trim().split(/\r?\n/u).filter(Boolean);
    const usableMatch = matches.find((match) => !/\\Windows\\System32\\bash\.exe$/iu.test(match));
    return result.status === 0 && usableMatch ? usableMatch : 'bash';
  }
  return 'bash';
}

function toBashPath(filePath) {
  const result = spawnSync(bashCommand, ['-lc', 'cygpath -u "$NATIVE_PATH"'], {
    encoding: 'utf8',
    env: { ...process.env, NATIVE_PATH: filePath }
  });
  return result.status === 0 ? result.stdout.trim() : filePath.replaceAll('\\', '/');
}

function createStubEnvironment(codexInstalled) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-shell-test-'));
  const binDir = path.join(tempDir, 'bin');
  const nodeLog = path.join(tempDir, 'node.log');
  const npmLog = path.join(tempDir, 'npm.log');

  tempDirs.push(tempDir);
  fs.mkdirSync(binDir);

  writeStub(binDir, 'node', 'printf "%s\\n" "$@" > "$STUB_NODE_LOG"');
  writeStub(binDir, 'npm', 'printf "npm-called\\n" >> "$STUB_NPM_LOG"');

  if (codexInstalled) {
    writeStub(binDir, 'codex', 'exit 0');
  }

  return {
    nodeLog,
    npmLog,
    pathValue: `${toBashPath(binDir)}:/usr/bin:/bin`
  };
}

function runShellScript(shellFile, codexInstalled) {
  const envInfo = createStubEnvironment(codexInstalled);
  const inheritedEnv = globalThis.process?.env ?? {};
  const result = spawnSync(bashCommand, [toBashPath(path.join(codexDir, shellFile)), '--dry-run'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...inheritedEnv,
      PATH: envInfo.pathValue,
      STUB_NODE_LOG: envInfo.nodeLog,
      STUB_NPM_LOG: envInfo.npmLog
    }
  });

  return { ...envInfo, result };
}

describe('codex shell launchers', () => {
  it.each(scripts)('removes automatic npm install from $shellFile', ({ shellFile }) => {
    const source = fs.readFileSync(path.join(codexDir, shellFile), 'utf8');

    expect(source).not.toContain('npm install -g');
  });

  it.each(scripts)('keeps running when codex is already installed: $shellFile', ({ shellFile, moduleFile }) => {
    const { nodeLog, npmLog, result } = runShellScript(shellFile, true);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(nodeLog, 'utf8')).toContain(moduleFile);
    expect(fs.readFileSync(nodeLog, 'utf8')).toContain('--dry-run');
    expect(fs.existsSync(npmLog)).toBe(false);
  });

  it.each(scripts)('fails early without codex and never calls npm: $shellFile', ({ shellFile, prefix }) => {
    const { nodeLog, npmLog, result } = runShellScript(shellFile, false);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${prefix} codex not found in PATH.`);
    expect(result.stdout).toContain('Manually install the @openai/codex CLI');
    expect(fs.existsSync(nodeLog)).toBe(false);
    expect(fs.existsSync(npmLog)).toBe(false);
  });
});
