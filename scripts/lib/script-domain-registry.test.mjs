// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  classifyScriptAsset,
  renderCapabilityCommand,
  resolveCapabilityAdapter,
  resolveCapabilityContract
} from './script-domain-registry.mjs';

describe('script domain registry', () => {
  it('keeps execution placement separate and allows real Windows overlap', () => {
    expect(classifyScriptAsset('scripts/windows/package-windows.mjs')).toMatchObject({
      disposition: 'active',
      placements: ['windows-ci', 'windows-only']
    });
    expect(classifyScriptAsset('scripts/windows/windows-preview-native-entry.mjs')).toMatchObject({
      placements: ['windows-device', 'windows-only']
    });
    expect(classifyScriptAsset('scripts/android/windows-open.ps1')).toMatchObject({
      placements: ['windows-device', 'windows-only']
    });
    expect(classifyScriptAsset('scripts/lib/path-domains.mjs')).toMatchObject({
      placements: ['shared-core']
    });
  });

  it('uses exact confirm records with reasons instead of prefix fallback', () => {
    expect(classifyScriptAsset('scripts/oneoff/migrate-workspace-data.mjs')).toMatchObject({
      disposition: 'confirm',
      confirmReason: expect.stringContaining('one-off migration runner')
    });
    expect(classifyScriptAsset('scripts/oneoff/new-unregistered.mjs')).toMatchObject({
      disposition: 'active',
      confirmReason: null
    });
    expect(classifyScriptAsset('src/app/App.tsx')).toBeNull();
  });

  it('resolves registered capability argv without executing adapters', () => {
    const contract = resolveCapabilityContract('release:windows:package');

    expect(renderCapabilityCommand(contract)).toBe('node scripts/windows/package-windows.mjs --native');
    expect(resolveCapabilityAdapter('release:windows:package', 'win32')).toMatchObject({
      ok: true,
      placements: ['windows-ci', 'windows-only']
    });
    expect(resolveCapabilityAdapter('release:windows:package', 'darwin')).toEqual({
      ok: false,
      reason: 'unsupported-platform'
    });
    expect(resolveCapabilityAdapter('missing', 'linux')).toEqual({
      ok: false,
      reason: 'unknown-capability'
    });
  });
});
