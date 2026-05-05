// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'verify-preview.sh');

function runScript(env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SCRIPT_PATH], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env }
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
      resolve({ code, stderr, stdout });
    });
  });
}

async function createMockCommand(rootDir, relativePath, body) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, ['#!/usr/bin/env bash', 'set -euo pipefail', body].join('\n'), {
    encoding: 'utf8',
    mode: 0o755
  });
  return fullPath;
}

describe('verify-preview.sh', () => {
  it('runs preview after verification succeeds', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'verify-preview-'));
    try {
      const markerPath = path.join(tempRoot, 'order.log');
      const validateScript = await createMockCommand(
        tempRoot,
        'validate.sh',
        `printf 'verify\n' >> "${markerPath}"`
      );
      const finishScript = await createMockCommand(
        tempRoot,
        'finish.sh',
        `printf 'preview\n' >> "${markerPath}"`
      );

      const result = await runScript({
        VERIFY_PREVIEW_HEARTBEAT_SECONDS: '1',
        VERIFY_PREVIEW_VALIDATE_COMMAND: `bash ${validateScript}`,
        VERIFY_PREVIEW_FINISH_COMMAND: `bash ${finishScript}`
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('step 1/2 verify');
      expect(result.stdout).toContain('step 2/2 preview');
      expect(result.stdout).toContain('passed: step 1/2 verify');
      expect(result.stdout).toContain('passed: step 2/2 preview');
      expect(result.stdout).toContain('[verify-preview] done');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('prints progress while verification is still running', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'verify-preview-'));
    try {
      const validateScript = await createMockCommand(
        tempRoot,
        'validate.sh',
        'echo "verify still busy"; sleep 2'
      );
      const finishScript = await createMockCommand(
        tempRoot,
        'finish.sh',
        'echo "preview ok"'
      );

      const result = await runScript({
        VERIFY_PREVIEW_HEARTBEAT_SECONDS: '1',
        VERIFY_PREVIEW_VALIDATE_COMMAND: `bash ${validateScript}`,
        VERIFY_PREVIEW_FINISH_COMMAND: `bash ${finishScript}`
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('waiting: step 1/2 verify still running (1s elapsed)');
      expect(result.stdout).toContain('last output: verify still busy');
      expect(result.stdout).toContain('step 2/2 preview');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('stops before preview when verification fails', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'verify-preview-'));
    try {
      const markerPath = path.join(tempRoot, 'preview.log');
      const validateScript = await createMockCommand(
        tempRoot,
        'validate.sh',
        'echo "verify failed"; exit 1'
      );
      const finishScript = await createMockCommand(
        tempRoot,
        'finish.sh',
        `printf 'preview\n' >> "${markerPath}"`
      );

      const result = await runScript({
        VERIFY_PREVIEW_VALIDATE_COMMAND: `bash ${validateScript}`,
        VERIFY_PREVIEW_FINISH_COMMAND: `bash ${finishScript}`
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('step 1/2 verify');
      expect(result.stdout).toContain('failed: step 1/2 verify exited with code 1');
      expect(result.stdout).toContain('last output: verify failed');
      expect(result.stdout).toContain('blocked: verification did not pass, so preview was skipped');
      expect(result.stdout).not.toContain('step 2/2 preview');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('explains when verification is blocked by the memory limit', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'verify-preview-'));
    try {
      const markerPath = path.join(tempRoot, 'preview.log');
      const validateScript = await createMockCommand(
        tempRoot,
        'validate.sh',
        'echo "[quality-gate-fast] failed: test exceeded memory limit (65536 KiB > 32768 KiB)"; exit 1'
      );
      const finishScript = await createMockCommand(
        tempRoot,
        'finish.sh',
        `printf 'preview\n' >> "${markerPath}"`
      );

      const result = await runScript({
        VERIFY_PREVIEW_VALIDATE_COMMAND: `bash ${validateScript}`,
        VERIFY_PREVIEW_FINISH_COMMAND: `bash ${finishScript}`
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('failed: test exceeded memory limit');
      expect(result.stdout).toContain('last output: [quality-gate-fast] failed: test exceeded memory limit');
      expect(result.stdout).toContain('blocked: verification hit the memory limit, so preview was skipped');
      expect(result.stdout).not.toContain('step 2/2 preview');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
