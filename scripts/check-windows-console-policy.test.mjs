// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCli } from './check-windows-console-policy.mjs';

const tempDirs = [];

async function createFixtureRoot(files) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-console-policy-'));
  tempDirs.push(fixtureRoot);

  for (const [relativePath, contents] of Object.entries(files)) {
    const targetPath = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents.trimStart(), 'utf8');
  }

  return fixtureRoot;
}

function createWritableBuffer() {
  const chunks = [];
  return {
    chunks,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    }
  };
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-windows-console-policy', () => {
  it('passes for hidden or current-window console process launches', async () => {
    const fixtureRoot = await createFixtureRoot({
      'scripts/windows/start.ps1': `
        Start-Process \`
          -FilePath "cmd.exe" \`
          -ArgumentList @("/d", "/c", "npm run electron:dev") \`
          -WindowStyle Hidden \`
          -PassThru

        Start-Process \`
          -FilePath $NodePath \`
          -ArgumentList @("scripts/tool.mjs") \`
          -NoNewWindow \`
          -Wait
      `,
      'scripts/windows/start.mjs': `
        import { spawn } from 'node:child_process';
        spawn('cmd.exe', ['/d', '/c', 'npm run dev'], { windowsHide: true });
      `
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const result = runCli({ repoRoot: fixtureRoot, stderr, stdout });

    expect(result.exitCode).toBe(0);
    expect(stdout.chunks.join('')).toContain('status: OK');
    expect(stderr.chunks.join('')).toBe('');
  });

  it('fails on console launches that can leave visible terminal windows', async () => {
    const fixtureRoot = await createFixtureRoot({
      'scripts/windows/visible.ps1': `
        Start-Process \`
          -FilePath "cmd.exe" \`
          -ArgumentList @("/d", "/c", "npm run dev") \`
          -PassThru
      `,
      'scripts/windows/keep-open.cmd': `
        cmd.exe /K scripts\\start-companion.cmd
      `,
      'scripts/windows/spawn.mjs': `
        import { spawn } from 'node:child_process';
        spawn('powershell.exe', ['-File', 'scripts/run.ps1']);
      `,
      'scripts/windows/policy.test.mjs': `
        cmd.exe /K is ignored in tests
      `
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const result = runCli({ repoRoot: fixtureRoot, stderr, stdout });
    const output = `${stdout.chunks.join('')}${stderr.chunks.join('')}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('visible.ps1:1 Start-Process launches a console process');
    expect(output).toContain('keep-open.cmd:1 cmd /K keeps a visible terminal open');
    expect(output).toContain('spawn.mjs:2 Node child_process launches a Windows console command');
    expect(output).not.toContain('policy.test.mjs');
  });
});
