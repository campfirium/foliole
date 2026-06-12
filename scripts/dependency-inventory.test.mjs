// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { classifyLicense, inspectDependencyInventory } from './dependency-inventory.mjs';

describe('dependency inventory', () => {
  it('classifies GPL dual-license, GPL-only, missing, and unlicensed packages separately', () => {
    expect(classifyLicense('(MIT OR GPL-3.0-or-later)')).toBe('dual-license-with-gpl');
    expect(classifyLicense('GPL-3.0-only')).toBe('gpl-family');
    expect(classifyLicense('UNLICENSED')).toBe('unlicensed');
    expect(classifyLicense('Unlicense')).toBe('unlicense');
    expect(classifyLicense(undefined)).toBe('missing-license');
  });

  it('reports direct/transitive license and deprecated inventory from package-lock data', () => {
    const inventory = inspectDependencyInventory({
      packages: {
        '': {
          dependencies: { jszip: '3.10.1' },
          devDependencies: { glob: '7.2.3' }
        },
        'node_modules/jszip': {
          license: '(MIT OR GPL-3.0-or-later)',
          version: '3.10.1'
        },
        'node_modules/khroma': {
          version: '2.1.0'
        },
        'node_modules/glob': {
          deprecated: 'Old versions of glob are not supported.',
          license: 'ISC',
          version: '7.2.3'
        },
        'node_modules/foo/node_modules/gpl-only': {
          license: 'GPL-3.0-only',
          version: '1.0.0'
        },
        'node_modules/private-lib': {
          license: 'UNLICENSED',
          version: '1.0.0'
        }
      }
    });

    expect(inventory.license.dualLicenseWithGpl).toMatchObject([{ direct: true, name: 'jszip' }]);
    expect(inventory.license.missingLicense).toMatchObject([{ direct: false, name: 'khroma' }]);
    expect(inventory.license.gplFamily).toMatchObject([{ direct: false, name: 'gpl-only' }]);
    expect(inventory.license.unlicensed).toMatchObject([{ direct: false, name: 'private-lib' }]);
    expect(inventory.deprecated).toMatchObject([{ direct: true, name: 'glob' }]);
  });
});
