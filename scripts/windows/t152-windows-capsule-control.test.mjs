import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const control = fs.readFileSync('scripts/windows/t152-windows-capsule-control.mjs', 'utf8');
const action = fs.readFileSync('scripts/windows/t152-windows-capsule-action.ps1', 'utf8');
const formal = fs.readFileSync('scripts/windows/t152-windows-capsule-formal-runner.mjs', 'utf8');
const firstPhase = fs.readFileSync('scripts/windows/t152-macos-to-windows-find.mjs', 'utf8');

describe('T152 Windows immutable capsule controller', () => {
  it('pins the product identity and never consumes the Windows dev mirror', () => {
    expect(control).toContain('86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a');
    expect(control).toContain('ec8af4a625d98fb35e86134d8770c50a5e669ccb');
    expect(control).toContain('33270551363');
    expect(`${control}\n${action}`).not.toMatch(/refs\/heads\/dev|windows-dev-pull|D:\\\\C\\\\foliole/u);
  });

  it('keeps the remote surface bounded and verifies immutable inputs before dependency writes', () => {
    expect(action).toContain('[ValidateSet("host-facts", "prepare", "find-acceptance")]');
    expect(action.indexOf('archive digest mismatch')).toBeLessThan(action.indexOf('"dependencies"'));
    expect(action.indexOf('lockfile digest mismatch')).toBeLessThan(action.indexOf('"dependencies"'));
    expect(action.indexOf('archive file list mismatch')).toBeLessThan(action.indexOf('"dependencies"'));
    expect(action).toContain('[StringComparer]::Ordinal');
    expect(action).toContain('if ($exitCode -ne 0)');
    expect(action).toContain('"find-acceptance"');
    expect(action).toContain('"C:\\T152\\$AttemptId"');
    expect(action).not.toMatch(/Set-Net|New-Net|Remove-Net|Restart-Service|Set-Service/u);
  });

  it('is committed as a self-contained controller entry', () => {
    expect(control).not.toMatch(/^import .*\.\/windows-/mu);
    expect(control).toContain('pathToFileURL(fs.realpathSync(process.argv[1]))');
    expect(() => execFileSync('node', ['--check', 'scripts/windows/t152-windows-capsule-control.mjs']))
      .not.toThrow();
  });

  it('runs the first formal phase only from exact product and short task libraries', () => {
    expect(firstPhase).toContain('86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a');
    expect(firstPhase).toContain("baseRoot: '/private/tmp/foliole-t152-libraries'");
    expect(firstPhase).toContain("'-Action', 'find-acceptance'");
    expect(firstPhase).toContain('fs.mkdirSync(evidenceParent, { recursive: true })');
    expect(formal).toContain("action !== 'desktop-dnssd-find-acceptance'");
    expect(`${formal}\n${firstPhase}`).not.toMatch(/refs\/heads\/dev|windows-dev-pull/u);
  });
});
