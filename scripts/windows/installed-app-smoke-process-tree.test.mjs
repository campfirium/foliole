import { Buffer } from 'node:buffer';

import { describe, expect, it, vi } from 'vitest';

import { readInstalledProcessTree } from './installed-app-smoke.mjs';

describe('installed app smoke process diagnostics', () => {
  it('captures the launcher and descendants through an encoded PowerShell command', () => {
    const run = vi.fn(() => ({
      status: 0,
      stderr: '',
      stdout: '[{"ProcessId":42,"ParentProcessId":1,"Name":"Foliole.exe"}]\n'
    }));

    expect(readInstalledProcessTree(42, run)).toContain('"ProcessId":42');
    expect(run).toHaveBeenCalledWith(
      'pwsh.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)],
      { encoding: 'utf8', timeout: 15_000, windowsHide: true }
    );
    const encoded = run.mock.calls[0][1][3];
    const command = Buffer.from(encoded, 'base64').toString('utf16le');
    expect(command).toContain('[void]$ids.Add(42)');
    expect(command).not.toContain('|;');
  });

  it('reports a failed process query without hiding the smoke failure', () => {
    const result = readInstalledProcessTree(42, () => ({
      status: 1,
      stderr: 'query failed',
      stdout: ''
    }));

    expect(result).toContain('process tree unavailable status=1 error=query failed');
  });
});
