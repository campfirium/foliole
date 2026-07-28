// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Windows Android Lab runtime updater', () => {
  it('refreshes the installed audited runtime from the committed checkout', () => {
    const source = fs.readFileSync('scripts/windows/windows-android-lab-update-runtime.ps1', 'utf8');

    expect(source).toContain('$files = @(& $nodePath');
    expect(source).toContain('windows-android-lab-dispatcher.mjs');
    expect(source).toContain('windows-android-lab-runtime-manifest.mjs');
    expect(source).toContain('windows-android-lab-runtime-update.mjs');
    expect(source).toContain('windows-android-lab-selfcheck.mjs');
    expect(source).toContain('windows-android-lab-worker.mjs');
    expect(source).not.toContain("$files = @(\n");
    expect(source).toContain('$nodePath --check');
    expect(source).toContain('.runtime-update-staging-$PID');
    expect(source).toContain('.runtime-update-backup-$PID');
    expect(source).toContain('Copy-Item -LiteralPath $source -Destination $target -Force');
    expect(source).toContain('Move-Item -LiteralPath');
    expect(source).toContain('windows-android-lab-git-repositories.mjs');
    expect(source).toContain('--root $InstallRoot --git-path $config.gitPath');
    expect(source).toContain('status: UPDATED');
    expect(source).not.toContain('Register-ScheduledTask');
    expect(source).not.toContain('authorized_keys');
  });
});
