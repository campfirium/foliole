import { expect, it } from 'vitest';

import {
  buildWindowsSyncClientPowerShell, parseWindowsSyncClientArgs
} from './windows-sync-client-control.mjs';

it('parses only fixed Windows sync client actions', () => {
  expect(parseWindowsSyncClientArgs(['facts'])).toEqual({ action: 'facts' });
  expect(parseWindowsSyncClientArgs(['align', '--revision', 'a'.repeat(40)])).toEqual({
    action: 'align', revision: 'a'.repeat(40)
  });
  expect(parseWindowsSyncClientArgs(['stop', '--port', '9222'])).toEqual({ action: 'stop', port: 9222 });
  expect(() => parseWindowsSyncClientArgs(['start', '--revision', 'short'])).toThrow('full commit');
});

it('pins the Windows sync checkout and exact candidate revision', () => {
  const script = buildWindowsSyncClientPowerShell({
    action: 'start', instance: 'b', port: 9222, revision: 'b'.repeat(40)
  });
  expect(script).toContain("$branch -ne 'sync'");
  expect(script).toContain("$root -ne 'D:/C/foliole-sync'");
  expect(script).toContain('candidate-bbbbbbbbbb\\instance-b\\windows');
  expect(script).toContain("--revision 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'");
});

it('materializes locked dependencies and the Electron ABI while aligning', () => {
  const script = buildWindowsSyncClientPowerShell({
    action: 'align', revision: 'c'.repeat(40)
  });
  expect(script).toContain('git reset --hard $target');
  expect(script).not.toContain('git merge --ff-only');
  expect(script).toContain('Windows sync exact alignment failed');
  expect(script).toContain("'C:\\Program Files\\nodejs\\npm.cmd' ci");
  expect(script).toContain("'C:\\Program Files\\nodejs\\node.exe' 'D:\\C\\foliole-sync\\node_modules\\electron\\install.js'");
  expect(script).toContain("'C:\\Program Files\\nodejs\\npm.cmd' run electron:rebuild:native");
  expect(script).toContain('Windows sync dependencies failed to materialize');
  expect(script).toContain('Windows sync Electron runtime failed to materialize');
  expect(script).toContain('Windows sync Electron native ABI rebuild failed');
});

it('stops only the isolated Foliole Electron listener on the requested port', () => {
  const script = buildWindowsSyncClientPowerShell({ action: 'stop', port: 9222 });
  expect(script).toContain('Get-NetTCPConnection -State Listen -LocalPort 9222');
  expect(script).toContain('node_modules\\electron\\dist\\electron.exe');
  expect(script).toContain('Stop-Process -Id $processId -Force');
});
