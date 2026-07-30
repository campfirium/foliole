// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

it('keeps cutover dry-run by default and an ordered exact rollback', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-cutover.mjs', 'utf8');
  expect(source).toContain("if (mode === 'dry-run')");
  expect(source).toContain('fs.renameSync(paths.oldBareRepository, paths.bareRepository)');
  expect(source).not.toContain('copyFileSync(paths.oldBareRepository');
  expect(source).toContain("git(paths, ['branch', '-m', 'dev'])");
  expect(source).toContain("git(paths, ['remote', 'set-url', 'lan', paths.bareRepository])");
  expect(source).toContain('writeAtomic(paths.authorizedKeys');
  expect(source).toContain('rollbackCutover(paths)');
  expect(source).toContain("git(paths, ['branch', '-m', backup.oldBranch])");
  expect(source).toContain('fs.renameSync(paths.bareRepository, paths.oldBareRepository)');
  expect(source).not.toMatch(/reset|stash|clean|clone/u);
});
