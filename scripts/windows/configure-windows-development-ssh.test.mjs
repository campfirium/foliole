// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('scripts/windows/configure-windows-development-ssh.ps1', 'utf8');

describe('Windows development SSH configuration', () => {
  it('installs one ordinary shell key and keeps Git receive on a dedicated forced key', () => {
    expect(source).toContain('no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc $($MacPublicKey.Trim())');
    expect(source).toContain('command=`"$NodePath $ReceiverPath`",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc');
    expect(source).toContain('$retained + $shellKey + $gitKey');
    expect(source).not.toMatch(/command=.*MacPublicKey/u);
  });

  it('rejects multiline, malformed, or reused key material before rewriting authorized_keys', () => {
    expect(source).toContain("$PublicKey -match '[\\r\\n]'");
    expect(source).toContain('$parts[0] -ne "ssh-ed25519"');
    expect(source).toContain('$shellKeyBody -eq $gitKeyBody');
    expect(source).toContain('$decoded.Length -ne 51');
    expect(source).toContain('[System.Text.UTF8Encoding]::new($false)');
    expect(source).toContain('administrators_authorized_keys');
    expect(source).toContain('"*S-1-5-32-544:F"');
  });
});
