// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertPublishedReleaseHistoryImmutable,
  assertPublishedRecordMapImmutable,
  assertReleaseIntentDigest,
  formatReleaseConfirmation,
  resolveReleasePlatformIdentity,
  validatePlatformRegistry
} from './release-platform-contract.mjs';

const REGISTRY = {
  schemaVersion: 1,
  platforms: [
    {
      id: 'macos', displayName: 'macOS', status: 'active', architectures: ['arm64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'desktop-updater',
      managedAssets: ['Foliole-macOS-arm64-{version}.dmg'],
      update: { mode: 'electron-updater', baselineVersion: '0.7.2' }
    },
    {
      id: 'windows', displayName: 'Windows', status: 'active', architectures: ['x64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'desktop-updater',
      managedAssets: ['Foliole-Windows-x64-{version}.exe'],
      update: { mode: 'electron-updater', baselineVersion: '0.7.3' }
    }
  ]
};

function intent(selectedPlatforms = ['windows']) {
  return {
    schemaVersion: 1,
    version: '0.8.0',
    selectedPlatforms,
    scopeBasis: Object.fromEntries(selectedPlatforms.map((id) => [id, `${id} is affected.`]))
  };
}

function resolve(overrides = {}) {
  return resolveReleasePlatformIdentity({
    registry: overrides.registry ?? REGISTRY,
    intent: overrides.intent ?? intent(),
    packageVersion: overrides.packageVersion ?? '0.8.0',
    sha: overrides.sha ?? 'a'.repeat(40)
  });
}

describe('platform release contract', () => {
  it('separates all hard gates from selected scope and keeps platform baselines independent', () => {
    const identity = resolve();

    expect(identity.activePlatforms).toEqual(['macos', 'windows']);
    expect(identity.hardGatePlatforms).toEqual(['macos', 'windows']);
    expect(identity.intent.selectedPlatforms).toEqual(['windows']);
    expect(identity.updaterBaselines).toEqual({ macos: '0.7.2', windows: '0.7.3' });
    expect(identity.managedAssets).toEqual(['Foliole-Windows-x64-0.8.0.exe']);
    expect(formatReleaseConfirmation(identity)).toContain('Platforms: Windows');
  });

  it('accepts Linux only through one explicit registry entry', () => {
    const linux = {
      id: 'linux', displayName: 'Linux Experimental', status: 'active', architectures: ['x64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'deb',
      managedAssets: ['Foliole-Linux-x64-{version}.deb'],
      update: { mode: 'manual', baselineVersion: null }
    };
    const identity = resolve({
      registry: { ...REGISTRY, platforms: [...REGISTRY.platforms, linux] },
      intent: intent(['linux'])
    });

    expect(identity.hardGatePlatforms).toEqual(['macos', 'windows', 'linux']);
    expect(identity.updaterBaselines.linux).toBe('');
    expect(identity.managedAssets).toEqual(['Foliole-Linux-x64-0.8.0.deb']);
  });

  it('rejects empty, unknown, retired, and unsupported platform scopes', () => {
    expect(() => resolve({ intent: { ...intent(), selectedPlatforms: [] } })).toThrow('non-empty array');
    expect(() => resolve({ intent: intent(['linux']) })).toThrow('unknown platform linux');
    const retired = {
      ...REGISTRY.platforms[1],
      status: 'retired',
      retirement: {
        lastPublicVersion: '0.7.4',
        feedUrl: 'https://updates.foliole.com/windows/',
        archiveUrl: 'https://foliole.com/downloads/windows/archive/',
        reason: 'Windows support ended.'
      }
    };
    expect(() => resolve({
      registry: { ...REGISTRY, platforms: [REGISTRY.platforms[0], retired] }
    })).toThrow('cannot select retired platform windows');
  });

  it('preserves retired release, feed, archive, and support diagnostics', () => {
    const retired = {
      ...REGISTRY.platforms[1], status: 'retired',
      retirement: {
        lastPublicVersion: '0.7.4', feedUrl: 'https://updates.foliole.com/windows/',
        archiveUrl: 'https://foliole.com/downloads/windows/archive/', reason: 'Windows support ended.'
      }
    };
    const registry = validatePlatformRegistry({ ...REGISTRY, platforms: [REGISTRY.platforms[0], retired] });
    expect(registry.platforms[1].retirement).toEqual(retired.retirement);
  });

  it('rejects global updater baselines and mismatched scope evidence', () => {
    expect(() => validatePlatformRegistry({ ...REGISTRY, updaterBaselineVersion: '0.7.2' }))
      .toThrow('baselines on each platform');
    expect(() => resolve({ intent: { ...intent(), scopeBasis: { macos: 'wrong scope' } } }))
      .toThrow('exactly match selectedPlatforms');
  });

  it('binds scope to version and SHA and rejects any later intent drift', () => {
    const identity = resolve();
    expect(assertReleaseIntentDigest(identity, identity.digest)).toBe(identity);
    expect(resolve({ sha: 'b'.repeat(40) }).digest).not.toBe(identity.digest);
    expect(resolve({ intent: intent(['macos']) }).digest).not.toBe(identity.digest);
    expect(() => assertReleaseIntentDigest(resolve({ intent: intent(['macos']) }), identity.digest))
      .toThrow('changed after release identity was frozen');
    expect(() => resolve({ packageVersion: '0.8.1' })).toThrow('must match package.json version');
  });

  it('keeps published notes and platform applicability immutable', () => {
    const previous = { releases: [{ version: '0.7.4', platforms: ['macos'], notes: ['Fixed capture.'] }] };
    const appended = { releases: [{ ...previous.releases[0] }, { version: '0.8.0', platforms: ['windows'] }] };
    expect(() => assertPublishedReleaseHistoryImmutable(previous, appended)).not.toThrow();
    expect(() => assertPublishedReleaseHistoryImmutable(previous, {
      releases: [{ version: '0.7.4', platforms: ['windows'], notes: ['Changed later.'] }]
    })).toThrow('notes and platform applicability are immutable');
    expect(() => assertPublishedRecordMapImmutable(
      { '0.7.4': { notes: ['Original note.'] } },
      { '0.7.4': { notes: ['Rewritten note.'] } },
      'en release notes'
    )).toThrow('published en release notes 0.7.4 is immutable');
  });
});
