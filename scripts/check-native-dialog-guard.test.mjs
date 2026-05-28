// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCli } from './check-native-dialog-guard.mjs';

const tempDirs = [];

async function createFixtureRoot(files) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'native-dialog-guard-'));
  tempDirs.push(fixtureRoot);

  for (const [relativePath, contents] of Object.entries(files)) {
    const targetPath = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents, 'utf8');
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

describe('check-native-dialog-guard', () => {
  it('passes when production renderer code uses app dialogs', async () => {
    const fixtureRoot = await createFixtureRoot({
      'src/app/components/Dialog.tsx': `
        import { requestAppConfirmation } from '../../shared/ui';
        export function run() {
          return requestAppConfirmation({ title: 'Confirm', confirmLabel: 'OK' });
        }
      `
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stderr, stdout });

    expect(cliResult.exitCode).toBe(0);
    expect(stdout.chunks.join('')).toContain('status: OK');
    expect(stderr.chunks.join('')).toBe('');
  });

  it('fails on native browser dialog calls in production renderer code', async () => {
    const fixtureRoot = await createFixtureRoot({
      'src/app/components/Menu.tsx': `
        export function Menu() {
          if (window.confirm('Continue?')) window.alert('Done');
          prompt('Name');
        }
      `,
      'src/features/editor/model/safe.test.ts': `
        window.confirm('test-only calls are ignored');
      `
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stderr, stdout });
    const output = `${stdout.chunks.join('')}${stderr.chunks.join('')}`;

    expect(cliResult.exitCode).toBe(1);
    expect(output).toContain('status: FAILED');
    expect(output).toContain('Menu.tsx:3 native confirm()');
    expect(output).toContain('Menu.tsx:3 native alert()');
    expect(output).toContain('Menu.tsx:4 native prompt()');
    expect(output).not.toContain('safe.test.ts');
  });
});
