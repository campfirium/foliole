// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import { runWindowsDesktopDnsSdHostFacts } from
  './windows-desktop-dnssd-host-facts-action.mjs';

it('writes only the bounded read-only host snapshot returned by the fixed script', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dnssd-host-facts-'));
  const evidenceRoot = path.join(repoRoot, 'evidence');
  fs.mkdirSync(evidenceRoot);
  const facts = { activePhysicalAdapters: [{ interfaceIndex: 7 }],
    dnsSdService: { name: 'Dnscache', status: 'Running' }, schemaVersion: 1 };
  const execute = vi.fn(async () => ({ code: 0, stderr: '',
    stdout: `${JSON.stringify(facts)}\n` }));
  const result = await runWindowsDesktopDnsSdHostFacts(
    'desktop-dnssd-host-facts', execute, { repoRoot }, evidenceRoot
  );
  expect(result.evidence).toEqual(facts);
  expect(JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'))).toEqual(facts);
  expect(execute.mock.calls[0][1]).toContain(
    path.join(repoRoot, 'scripts', 'windows', 'windows-desktop-dnssd-host-facts.ps1')
  );
  expect(execute.mock.calls[0][1]).toContain('-NonInteractive');
  fs.rmSync(repoRoot, { force: true, recursive: true });
});

it('does not claim host facts for another action', async () => {
  await expect(runWindowsDesktopDnsSdHostFacts('build', vi.fn(), {}, 'unused'))
    .resolves.toBeNull();
});
