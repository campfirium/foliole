// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

it('keeps the versioned old database isolated to its independent upgrade entry', () => {
  const files = reachableImports('scripts/ios/ios-database-upgrade-acceptance-runner.mjs');
  expect(files).toContain('scripts/ios/ios-database-upgrade-contract-fixture.mjs');
  const importers = fs.readdirSync('scripts/ios')
    .filter((name) => /\.(?:mjs|ts)$/u.test(name) && !name.includes('.test.'))
    .filter((name) => fs.readFileSync(`scripts/ios/${name}`, 'utf8')
      .includes('./ios-database-upgrade-contract-fixture.mjs'));
  expect(importers).toEqual(['ios-database-upgrade-acceptance-runner.mjs']);
});

function reachableImports(entry) {
  const pending = [entry];
  const visited = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved) pending.push(resolved);
    }
  }
  return [...visited].sort();
}

function resolveImport(fromFile, specifier) {
  const candidate = path.normalize(path.join(path.dirname(fromFile), specifier));
  for (const file of [candidate, candidate.replace(/\.js$/, '.ts')]) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}
