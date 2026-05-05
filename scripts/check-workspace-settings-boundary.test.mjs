// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCli } from './check-workspace-settings-boundary.mjs';

const tempDirs = [];

async function createFixtureRoot(files) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'workspace-settings-boundary-'));
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

describe('check-workspace-settings-boundary', () => {
  it('passes when workspace props and settings overlay do not forward extracted settings', async () => {
    const fixtureRoot = await createFixtureRoot({
      'src/app/components/WorkspaceLayout.tsx': `
        export interface WorkspaceLayoutProps {
          activeNodeId: string | null;
          isSettingsOpen: boolean;
          onCloseSettings: () => void;
        }
      `,
      'src/app/components/WorkspaceSettingsOverlay.tsx': `
        export function WorkspaceSettingsOverlay() {
          return <SettingsPanel onClose={() => undefined} />;
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

  it('fails when workspace props or settings overlay forward banned settings fields', async () => {
    const fixtureRoot = await createFixtureRoot({
      'src/app/components/WorkspaceLayout.tsx': `
        import type { HotkeySettingItem } from '../../features/settings/model/hotkeySettings';
        export interface WorkspaceLayoutProps {
          hotkeyItems: HotkeySettingItem[];
          accentColorPreset: string;
        }
      `,
      'src/app/components/WorkspaceSettingsOverlay.tsx': `
        export function WorkspaceSettingsOverlay(props) {
          return <SettingsPanel hotkeyItems={props.hotkeyItems} />;
        }
      `
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stderr, stdout });
    const output = `${stdout.chunks.join('')}${stderr.chunks.join('')}`;

    expect(cliResult.exitCode).toBe(1);
    expect(output).toContain('status: VIOLATION');
    expect(output).toContain('WorkspaceLayout.tsx:2 import=../../features/settings/model/hotkeySettings');
    expect(output).toContain('WorkspaceLayout.tsx:4 prop=hotkeyItems');
    expect(output).toContain('WorkspaceLayout.tsx:5 prop=accentColorPreset');
    expect(output).toContain('WorkspaceSettingsOverlay.tsx:3 settings-panel-prop=hotkeyItems');
  });
});
