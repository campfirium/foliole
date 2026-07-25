// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { bootstrapWindowsAndroidLabController } from './windows-android-lab-controller-bootstrap.mjs';

describe('one-off Windows Android Lab controller bootstrap', () => {
  it('rejects non-Windows execution before accessing any path', () => {
    expect(() => bootstrapWindowsAndroidLabController({
      backupRoot: 'C:\\Users\\tester\\AppData\\Local\\Foliole\\windows-android-lab\\protection\\backups',
      platform: 'darwin'
    })).toThrow('requires Windows');
  });

  it('contains only the fixed controller files and commit-bound validation', () => {
    const source = fs.readFileSync('scripts/windows/windows-android-lab-controller-bootstrap.mjs', 'utf8');
    expect(source).toContain("status.state !== 'running'");
    expect(source).toContain("'status', '--porcelain'");
    expect(source).toContain("'windows-android-lab-dispatcher.mjs'");
    expect(source).not.toMatch(/authorized_keys|powershell|cmd\.exe|child_process\.exec\b/iu);
  });
});
