// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

const script = fs.readFileSync('scripts/windows/install-windows-device-runtime.ps1', 'utf8');

it('installs the pinned Node 22 x64 runtime with official checksum verification', () => {
  expect(script).toContain('22.23.1');
  expect(script).toContain('https://nodejs.org/dist/v$Version');
  expect(script).toContain('SHASUMS256.txt');
  expect(script).toContain('Get-FileHash -Algorithm SHA256');
  expect(script).toContain('node-v$Version-win-x64.zip');
  expect(script).toContain('node-path.txt');
});
