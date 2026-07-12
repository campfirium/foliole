// @vitest-environment node
/* global process */

import { describe, expect, it } from 'vitest';

import {
  collectScriptAssetPaths,
  hashScriptAssetPaths,
  inspectScriptDomainContract,
  validateScriptAsset
} from './check-script-domain-contract.mjs';

describe('script domain contract guard', () => {
  it('validates the real repository without executing registered adapters', () => {
    const paths = collectScriptAssetPaths(process.cwd());
    const result = inspectScriptDomainContract({ expectedInventoryHash: hashScriptAssetPaths(paths) });

    expect(result.ok, result.violations.join('\n')).toBe(true);
    expect(result.confirm.map((asset) => asset.path)).toContain('scripts/oneoff/migrate-workspace-data.mjs');
  });

  it('fails when the registered script inventory changes', () => {
    const result = inspectScriptDomainContract({ expectedInventoryHash: 'stale-inventory' });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.stringContaining('script asset inventory changed: expected=stale-inventory')
    ]);
  });

  it('rejects invalid lifecycle and execution records', () => {
    expect(validateScriptAsset({
      confirmReason: '',
      disposition: 'confirm',
      path: 'scripts/example.mjs',
      placements: ['shared-core']
    })).toContain('confirm asset requires a reason');
    expect(validateScriptAsset({
      confirmReason: null,
      disposition: 'active',
      path: 'scripts/example.mjs',
      placements: ['unknown']
    })).toContain('unknown execution placement: unknown');
  });
});
