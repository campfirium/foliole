// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Windows Android Lab runtime updater', () => {
  it('refreshes the installed audited runtime from the committed checkout', () => {
    const source = fs.readFileSync('scripts/windows/windows-android-lab-update-runtime.ps1', 'utf8');

    expect(source).toContain('windows-android-lab-worker.mjs');
    expect(source).toContain('windows-android-lab-adb.mjs');
    expect(source).toContain('windows-android-lab-dispatcher.mjs');
    expect(source).toContain('windows-android-lab-runtime-update.mjs');
    expect(source).toContain('windows-android-lab-selfcheck.mjs');
    expect(source).toContain('windows-android-lab-operation.mjs');
    expect(source).toContain('$nodePath --check');
    expect(source).toContain('Copy-Item -LiteralPath $source -Destination $target -Force');
    expect(source).toContain('status: UPDATED');
    expect(source).not.toContain('Register-ScheduledTask');
    expect(source).not.toContain('authorized_keys');
    expect(source).not.toContain('Remove-Item');
  });
});
