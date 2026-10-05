import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { assertFramedProductionCutover, auditFramedProductionReachability,
  classifyReference } from './framed-production-reachability.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function temporaryRepository(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-reachability-'));
  temporaryRoots.push(root);
  for (const [file, source] of Object.entries(files)) {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, source);
  }
  return root;
}

function fixtureManifest() {
  return {
    sample: {
      kind: 'typescript', roots: ['src/coordinator.ts'], scopes: ['src'],
      legacy: { sqlite_pack: ['src/legacyPack.ts'] },
      framed: [{ root: 'src/coordinator.ts', file: 'src/framed.ts' }]
    }
  };
}

describe('framed production reachability', () => {
  it('proves the current production roots use only framed transport', () => {
    const audit = auditFramedProductionReachability(process.cwd());
    expect(audit.status).toBe('cutover_ready');
    expect(audit.cutoverReady).toBe(true);
    expect(audit.legacyProductionPaths).toEqual([]);
    expect(audit.missingFramedPaths).toEqual([]);
    expect(() => assertFramedProductionCutover(audit)).not.toThrow();
  });

  it('uses import edges and ignores comments or ordinary strings', () => {
    const root = temporaryRepository({
      'src/coordinator.ts': `const note = './legacyPack.js'; // import './legacyPack.js'\nexport { value } from './framed.js';`,
      'src/legacyPack.ts': 'export const legacy = true;',
      'src/framed.ts': 'export const value = true;'
    });
    const audit = auditFramedProductionReachability(root, fixtureManifest());
    expect(audit.status).toBe('cutover_ready');
    expect(audit.legacyProductionPaths).toEqual([]);
    expect(() => assertFramedProductionCutover(audit)).not.toThrow();
  });

  it('treats an absent legacy implementation as retired', () => {
    const root = temporaryRepository({
      'src/coordinator.ts': `export { value } from './framed.js';`,
      'src/framed.ts': 'export const value = true;'
    });
    const audit = auditFramedProductionReachability(root, fixtureManifest());
    expect(audit.status).toBe('cutover_ready');
    expect(audit.legacyProductionPaths).toEqual([]);
  });

  it('keeps test and fixture references out of production reachability', () => {
    const root = temporaryRepository({
      'src/coordinator.ts': `export { value } from './framed.js';`,
      'src/coordinator.test.ts': `import './legacyPack.js';`,
      'src/legacy.fixture.ts': `import './legacyPack.js';`,
      'src/legacyPack.ts': 'export const legacy = true;',
      'src/framed.ts': 'export const value = true;'
    });
    const audit = auditFramedProductionReachability(root, fixtureManifest());
    expect(audit.cutoverReady).toBe(true);
    expect(audit.platforms[0].references).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'src/coordinator.test.ts', kind: 'test' }),
      expect.objectContaining({ from: 'src/legacy.fixture.ts', kind: 'fixture' })
    ]));
  });

  it('fails the cutover assertion while a production root reaches a legacy entry', () => {
    const root = temporaryRepository({
      'src/coordinator.ts': `export { legacy } from './legacyPack.js';`,
      'src/legacyPack.ts': 'export const legacy = true;',
      'src/framed.ts': 'export const value = true;'
    });
    const audit = auditFramedProductionReachability(root, fixtureManifest());
    expect(audit.status).toBe('pending_cutover');
    expect(audit.legacyProductionPaths[0].path)
      .toEqual(['src/coordinator.ts', 'src/legacyPack.ts']);
    expect(() => assertFramedProductionCutover(audit)).toThrow('legacy=1:missing_framed=1');
  });
});

describe('reference classification', () => {
  it.each([
    ['src/runtime.ts', 'production'],
    ['src/runtime.test.ts', 'test'],
    ['android/app/src/androidTest/Runtime.java', 'test'],
    ['electron/runtime.fixture.ts', 'fixture'],
    ['electron/runtime.testSupport.ts', 'fixture']
  ])('classifies %s as %s', (file, expected) => {
    expect(classifyReference(file)).toBe(expected);
  });
});
