// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

const script = fs.readFileSync('scripts/windows/bootstrap-windows-device-controller.ps1', 'utf8');
const revision = '051b1a17d0e3332952b3f9a58fd3d05750d21538';

it('downloads the exact reviewed controller revision and verifies every file', () => {
  expect(script).toContain(`$revision = "${revision}"`);
  expect(script.match(/https:\/\/raw\.githubusercontent\.com\/campfirium\/foliole/g)).toHaveLength(1);
  expect(script.match(/\.mjs" = "[a-f0-9]{64}"/g)).toHaveLength(5);
  expect(script).toContain('Get-FileHash -Path $Path -Algorithm SHA256');
  expect(script).toContain('Assert-FileHash -Path $targetPath');
  expect(script).toContain('[Net.SecurityProtocolType]::Tls12');
  expect(script).toContain('-TimeoutSec 60');
});

it('preserves device credentials and restores controller files on failure', () => {
  expect(script).toContain('if ($task.State -eq "Running")');
  expect(script).toContain('[xml]$taskXml = Export-ScheduledTask -TaskName $taskName');
  expect(script).toContain('$taskXml.Task.Triggers.ChildNodes');
  expect(script).toContain('if ($triggerNodes.Count -ne 0)');
  expect(script.match(/Get-ScheduledTask -TaskName \$taskName/g)).toHaveLength(2);
  expect(script).toContain('Copy-Item -Path $targetPath -Destination (Join-Path $backupRoot $entry.Key)');
  expect(script).toContain('Copy-Item -Path $backupPath -Destination $targetPath -Force');
  expect(script).not.toMatch(/github-token\.txt|authorized_keys|Disable-ScheduledTask|Enable-ScheduledTask|Register-ScheduledTask|Set-ScheduledTask/);
});
