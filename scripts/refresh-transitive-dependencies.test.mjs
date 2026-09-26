// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { assertTransitiveOnly, selectTransitiveUpdates } from './refresh-transitive-dependencies.mjs';

const manifest = JSON.stringify({ dependencies: { react: '^18.3.1' } });
const lock = {
  packages: {
    '': { dependencies: { react: '^18.3.1' } },
    'node_modules/react': { version: '18.3.1' },
    'node_modules/jsdom/node_modules/nwsapi': { version: '2.2.23' },
    'node_modules/nwsapi': { version: '2.2.23' },
    'node_modules/left-pad': { version: '1.0.0' }
  }
};

describe('post-release transitive refresh', () => {
  it('selects only installed indirect updates and holds a proven failing package', () => {
    expect(selectTransitiveUpdates(JSON.parse(manifest), lock, {
      react: { current: '18.3.1', wanted: '18.3.2' },
      'left-pad': { current: '1.0.0', wanted: '1.1.0' },
      nwsapi: { current: '2.2.23', wanted: '2.2.27' },
      missing: { wanted: '1.0.0' }
    })).toEqual(['left-pad']);
  });

  it('rejects manifest, lock root, direct version, or held version drift', () => {
    const copy = () => JSON.parse(JSON.stringify(lock));
    expect(() => assertTransitiveOnly(manifest, manifest, lock, copy())).not.toThrow();
    expect(() => assertTransitiveOnly(manifest, '{}', lock, copy())).toThrow('package.json changed');
    const rootChanged = copy();
    rootChanged.packages[''].dependencies.react = '^19.0.0';
    expect(() => assertTransitiveOnly(manifest, manifest, lock, rootChanged)).toThrow('lockfile root changed');
    const directChanged = copy();
    directChanged.packages['node_modules/react'].version = '18.3.2';
    expect(() => assertTransitiveOnly(manifest, manifest, lock, directChanged)).toThrow('direct installed version');
    const heldChanged = copy();
    heldChanged.packages['node_modules/nwsapi'].version = '2.2.27';
    expect(() => assertTransitiveOnly(manifest, manifest, lock, heldChanged)).toThrow('held dependency');
  });
});
