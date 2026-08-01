// @vitest-environment node
/* global process */

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

describe.runIf(process.platform === 'darwin')('desktop update compatibility gate integration', () => {
  it('uses the real macOS updater provider to parse metadata and download the complete ZIP', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'foliole-updater-gate-integration-'));
    const target = 'Foliole-macOS-arm64-0.8.1.zip';
    const bytes = Buffer.from('production-shaped-update-payload');
    const sha512 = createHash('sha512').update(bytes).digest('base64');
    await writeFile(path.join(directory, target), bytes);
    await writeFile(path.join(directory, 'latest-mac.yml'), [
      'version: 0.8.1',
      'files:',
      `  - url: ${target}`,
      `    sha512: ${sha512}`,
      `    size: ${bytes.length}`,
      `path: ${target}`,
      `sha512: ${sha512}`,
      ''
    ].join('\n'));
    const script = 'scripts/desktop-update-compatibility-gate.mjs';
    const result = await run(process.execPath, [script, '--current-version=0.8.0',
      '--target-version=0.8.1', `--directory=${directory}`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        RUNNER_ENVIRONMENT: 'github-hosted'
      },
      timeout: 30_000
    });
    expect(result.stdout).toContain('status: VERIFIED from=0.8.0 to=0.8.1');
    expect(result.stdout).toContain('updater=MacUpdater executor=ElectronHttpExecutor');
  }, 35_000);
});
