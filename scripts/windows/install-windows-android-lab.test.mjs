// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Windows Android lab installer', () => {
  it('creates an isolated limited interactive task and forced SSH command', () => {
    const source = fs.readFileSync('scripts/windows/install-windows-android-lab.ps1', 'utf8');
    expect(source).toContain('Foliole\\windows-android-lab');
    expect(source).toContain('FolioleAndroidLab');
    expect(source).toContain('-LogonType Interactive -RunLevel Limited');
    expect(source).toContain('no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc');
    expect(source).toContain('A separate read-only Git token is required');
    expect(source).toContain('Required Android Lab command is missing from PATH');
    expect(source).toContain('Exactly one ready Android device must match DeviceSerial');
    expect(source).not.toContain('FoliolePhysicalAcceptance');
  });
});
