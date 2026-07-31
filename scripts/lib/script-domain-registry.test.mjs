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
    expect(classifyScriptAsset('scripts/windows/windows-ci-evidence.mjs')).toMatchObject({
      disposition: 'active',
      placements: ['windows-ci']
    });
    expect(classifyScriptAsset('scripts/windows/windows-preview-native-entry.mjs')).toMatchObject({
      placements: ['windows-device', 'windows-only']
    });
    expect(classifyScriptAsset('scripts/windows/windows-android-dev-diagnostics.mjs')).toMatchObject({
      placements: ['windows-device', 'windows-only']
    });
    expect(classifyScriptAsset('scripts/windows/windows-validation-kit-runner.mjs')).toMatchObject({
      placements: ['windows-ci', 'windows-device', 'windows-only']
    });
    expect(classifyScriptAsset('scripts/android/windows-deploy-app.ps1')).toMatchObject({
      placements: ['windows-device', 'windows-only']
    });
    expect(classifyScriptAsset('scripts/lib/path-domains.mjs')).toMatchObject({
      placements: ['shared-core']
    });
    expect(classifyScriptAsset('scripts/macos/electron-dev-preview.mjs')).toMatchObject({
      placements: ['macos-only']
    });
    expect(classifyScriptAsset('scripts/macos/macos-electron-dev.mjs')).toMatchObject({
      placements: ['macos-only']
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

  it('keeps deleted Windows main-development assets as obsolete tombstones', () => {
    expect(classifyScriptAsset('scripts/windows/windows-preview.sh')).toMatchObject({
      disposition: 'obsolete'
    });
    expect(classifyScriptAsset('scripts/windows/playwright-desktop-harness.mjs')).toMatchObject({
      disposition: 'obsolete'
    });
  });

  it('resolves registered capability argv without executing adapters', () => {
    const contract = resolveCapabilityContract('release:windows:package');

    expect(renderCapabilityCommand(contract)).toBe('node scripts/windows/package-windows.mjs');
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
    expect(resolveCapabilityAdapter('electron:dev', 'darwin')).toMatchObject({
      ok: true,
      placements: ['shared-core']
    });
    expect(resolveCapabilityAdapter('macos:dev:restart', 'darwin')).toMatchObject({
      ok: true,
      placements: ['macos-only']
    });
    expect(resolveCapabilityAdapter('macos:dev:restart', 'win32')).toEqual({
      ok: false,
      reason: 'unsupported-platform'
    });
    expect(renderCapabilityCommand(resolveCapabilityContract('android:host:test')))
      .toBe(
        'node scripts/quality/quality-command-contracts.mjs allow android:host:test && ' +
        'node scripts/android/native-linux-host.mjs gradle testDebugUnitTest'
      );
    expect(resolveCapabilityAdapter('android:host:test', 'win32')).toEqual({
      ok: false, reason: 'unsupported-platform'
    });
    expect(resolveCapabilityAdapter('android:web:dev', 'darwin')).toMatchObject({
      ok: true,
      placements: ['shared-core']
    });
  });
});
