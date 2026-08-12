// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { selectPlatformReleaseNoteSections } from '../src/shared/platform/runtime/updateReleaseNotes.ts';
import { selectLatestPlatformRelease } from '../src/shared/platform/updateCheckModel.ts';
import {
  applyIsolatedReleaseStep,
  auditCompatibilityRehearsal,
  createCompatibilityBridgePinnedInput,
  resolveRehearsalPlatformVersion
} from './release-compatibility-rehearsal.mjs';

const REGISTRY = {
  schemaVersion: 1,
  platforms: [
    {
      id: 'macos', displayName: 'macOS', status: 'active', architectures: ['arm64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'desktop-updater',
      downloadAsset: 'Foliole-macOS-{version}.dmg',
      managedAssets: ['Foliole-macOS-{version}.dmg', 'latest-mac.yml'],
      update: { mode: 'electron-updater', baselineVersion: '0.7.4' }
    },
    {
      id: 'windows', displayName: 'Windows', status: 'active', architectures: ['x64'],
      deliveryChannel: 'github-release', t7Required: true, artifactContract: 'desktop-updater',
      downloadAsset: 'Foliole-Windows-{version}.exe',
      managedAssets: ['Foliole-Windows-{version}.exe', 'latest.yml'],
      update: { mode: 'electron-updater', baselineVersion: '0.7.4' }
    }
  ]
};

const INITIAL = {
  downloads: null,
  githubLatestVersion: null,
  manifest: {
    desktopUpdater: { compatibilityBridgeVersion: null },
    latest: '0.7.4',
    releases: [],
    schemaVersion: 1
  },
  notes: {},
  publishedReleases: {}
};

function assets(version, platforms) {
  return REGISTRY.platforms.filter(({ id }) => platforms.includes(id))
    .flatMap(({ managedAssets }) => managedAssets.map((name) => name.replaceAll('{version}', version)));
}

function step(version, selectedPlatforms, publicationMode, notes = { notes: [`Shared ${version}`] }) {
  return {
    assets: assets(version, selectedPlatforms),
    notes,
    producerPlatforms: ['macos', 'windows'],
    publicationMode,
    selectedPlatforms,
    sha: version.replaceAll('.', '').padEnd(40, 'a'),
    version
  };
}

describe('isolated compatibility transition rehearsal', () => {
  it('moves repository latest through bridge, Windows-only, macOS-only, and full releases', () => {
    const bridge = applyIsolatedReleaseStep(INITIAL, REGISTRY, step('0.8.0', ['macos', 'windows'], 'bridge'));
    const windows = applyIsolatedReleaseStep(bridge, REGISTRY, step('0.8.1', ['windows'], 'scoped', {
      notes: ['Shared 0.8.1'], platformNotes: { windows: ['Windows fix'] }
    }));
    const macos = applyIsolatedReleaseStep(windows, REGISTRY, step('0.8.2', ['macos'], 'scoped', {
      notes: ['Shared 0.8.2'], platformNotes: { macos: ['macOS fix'] }
    }));
    const full = applyIsolatedReleaseStep(macos, REGISTRY, step('0.8.3', ['macos', 'windows'], 'scoped'));

    expect(full.githubLatestVersion).toBe('0.8.3');
    expect(resolveRehearsalPlatformVersion(windows, 'macos')).toBe('0.8.0');
    expect(resolveRehearsalPlatformVersion(windows, 'windows')).toBe('0.8.1');
    expect(resolveRehearsalPlatformVersion(macos, 'macos')).toBe('0.8.2');
    expect(resolveRehearsalPlatformVersion(macos, 'windows')).toBe('0.8.1');
    expect(resolveRehearsalPlatformVersion(full, 'macos')).toBe('0.8.3');
    expect(resolveRehearsalPlatformVersion(full, 'windows')).toBe('0.8.3');
    expect(auditCompatibilityRehearsal(full, REGISTRY)).toBe(true);

    expect(selectLatestPlatformRelease(full.manifest, '0.8.0', {
      architecture: 'x64', platform: 'windows'
    })?.version).toBe('0.8.3');
    expect(selectLatestPlatformRelease(full.manifest, '0.8.1', {
      architecture: 'arm64', platform: 'macos'
    })?.version).toBe('0.8.3');
    expect(selectPlatformReleaseNoteSections(full.manifest, full.notes, '0.8.0', '0.8.3', {
      architecture: 'arm64', platform: 'macos'
    }).map(({ releaseNotes }) => releaseNotes.notes)).toEqual([
      ['Shared 0.8.3'], ['Shared 0.8.2', 'macOS fix'], ['Shared 0.8.1']
    ]);
  });

  it('fails atomically and retains the previous installable state', () => {
    const bridge = applyIsolatedReleaseStep(INITIAL, REGISTRY, step('0.8.0', ['macos', 'windows'], 'bridge'));
    const broken = step('0.8.1', ['windows'], 'scoped');
    broken.assets = ['Foliole-Windows-0.8.1.exe'];

    expect(() => applyIsolatedReleaseStep(bridge, REGISTRY, broken)).toThrow('assets differ from intent');
    expect(bridge.githubLatestVersion).toBe('0.8.0');
    expect(resolveRehearsalPlatformVersion(bridge, 'macos')).toBe('0.8.0');
    expect(resolveRehearsalPlatformVersion(bridge, 'windows')).toBe('0.8.0');
  });

  it('does not skip an unselected platform producer hard gate', () => {
    const bridgeStep = step('0.8.0', ['macos', 'windows'], 'bridge');
    bridgeStep.producerPlatforms = ['windows'];
    expect(() => applyIsolatedReleaseStep(INITIAL, REGISTRY, bridgeStep)).toThrow('every active T7 producer');
  });

  it('forms pinned bridge input while preserving final user publication confirmation', () => {
    expect(createCompatibilityBridgePinnedInput(REGISTRY, '0.8.0')).toEqual({
      publicationMode: 'bridge',
      requiresPinnedReleaseAgent: true,
      requiresUserPublicationConfirmation: true,
      selectedPlatforms: ['macos', 'windows'],
      version: '0.8.0'
    });
  });
});
