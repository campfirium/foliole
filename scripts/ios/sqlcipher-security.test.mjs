// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileSqliteBackendContract } from './sqlite-backend-test-build.mjs';

// This compiles the production plugin storage implementation, not a mock or a second SQLite wrapper.
const native = describe.runIf(process.platform === 'darwin');
native('production iOS SQLite backend on the Mac native slice', () => {
  let root;
  let binary;
  const run = scenario => execFileSync(binary, [scenario, root], { encoding: 'utf8' });
  beforeAll(() => {
    const artifacts = path.resolve('.tmp/artifacts/T251-9/sqlite-backend-tests');
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(path.join(artifacts, 'run-'));
    binary = path.join(root, 'contract');
    compileSqliteBackendContract(process.cwd(), binary);
    run('seed');
  }, 240_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });
  it('does not contain the SQLCipher codec in the production backend', () => {
    expect(run('engine')).toContain('contract passed');
  });
  it('hands committed content to an independent reader, rolls back and persists after reopening', () => {
    expect(run('persistence')).toContain('contract passed');
  });
  it('supports FTS5 trigram, JSON and attached staging through the production backend', () => {
    expect(run('search')).toContain('contract passed');
  });
  it('rejects encryption before creating a file or modifying retained plaintext content', () => {
    expect(run('reject-encryption')).toContain('contract passed');
  });
});
