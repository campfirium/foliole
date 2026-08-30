// @vitest-environment node
/* global URL */

import fs from 'node:fs';
import { expect, it } from 'vitest';

import { resolveNpmManifestEntry, resolveNpmRuntimeOwner } from
  './t152-windows-npm-runtime-owner.mjs';

it('uses package resolution and manifest bin.npm without npm execution or scanning', () => {
  const source = fs.readFileSync(new URL('./t152-windows-npm-runtime-owner.mjs', import.meta.url), 'utf8');
  expect(source).toContain("resolve.resolve('npm/package.json')");
  expect(source).toContain('metadata.bin.npm');
  expect(source).not.toMatch(/npm\s+exec|\bnpx\b|readdir|Get-ChildItem|where\.exe/iu);
});

it('rejects invalid manifest bin and containment escape', () => {
  const base = { canonicalFile: (value) => value, installationRoot: 'X:\\Node',
    manifestPath: 'X:\\Node\\modules\\npm\\package.json' };
  expect(() => resolveNpmManifestEntry({ ...base,
    metadata: { name: 'npm', version: '1', bin: {} } })).toThrow('bin.npm');
  expect(() => resolveNpmManifestEntry({ ...base,
    metadata: { name: 'npm', version: '1', bin: { npm: 4 } } })).toThrow('bin.npm');
  expect(() => resolveNpmManifestEntry({ ...base,
    metadata: { name: 'npm', version: '1', bin: { npm: '..\\..\\..\\escape.js' } } }))
    .toThrow('escapes');
});

it('exports one bounded resolver owner', () => {
  expect(typeof resolveNpmRuntimeOwner).toBe('function');
  expect(typeof resolveNpmManifestEntry).toBe('function');
});
