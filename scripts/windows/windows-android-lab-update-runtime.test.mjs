// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Windows Android Lab runtime updater', () => {
  it('only refreshes the installed worker from the committed checkout', () => {
    const source = fs.readFileSync('scripts/windows/windows-android-lab-update-runtime.ps1', 'utf8');

    expect(source).toContain('windows-android-lab-worker.mjs');
    expect(source).toContain('Copy-Item -LiteralPath $source -Destination $target -Force');
    expect(source).toContain('status: UPDATED');
    expect(source).not.toContain('Register-ScheduledTask');
    expect(source).not.toContain('authorized_keys');
    expect(source).not.toContain('Remove-Item');
  });
});
