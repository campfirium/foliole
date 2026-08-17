// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { validateReleaseCandidateFiles } from './check-release-candidate.mjs';

const VERSION = '0.9.0';
const PLATFORM = (id, update) => ({
  architectures: ['x64'], artifactContract: `${id}-assets`, deliveryChannel: 'download',
  displayName: id, id, managedAssets: [`${id}-{version}.zip`], status: 'active',
  t7Required: true, update
});
const BASE = {
  androidGradle: 'versionCode 1\nversionName "0.9.0"\n',
  intent: {
    publicationMode: 'scoped', schemaVersion: 1,
    scopeBasis: { macos: 'shared desktop change' }, selectedPlatforms: ['macos'], version: VERSION
  },
  iosInfoPlist: '<string>$(MARKETING_VERSION)</string><string>$(CURRENT_PROJECT_VERSION)</string>',
  iosProject: 'MARKETING_VERSION = 0.9.0;\nCURRENT_PROJECT_VERSION = 1;\n',
  manifest: {
    desktopUpdater: { compatibilityBridgeVersion: '0.8.0' },
    releases: [{ platforms: ['macos', 'windows'], version: '0.8.0' }]
  },
  packageJson: { version: VERSION },
  packageLock: { packages: { '': { version: VERSION } }, version: VERSION },
  registry: {
    platforms: [
      PLATFORM('macos', { baselineVersion: '0.8.0', mode: 'electron-updater' }),
      PLATFORM('windows', { baselineVersion: '0.8.0', mode: 'electron-updater' })
    ],
    schemaVersion: 1
  }
};

describe('release candidate preflight', () => {
  it('accepts one repository-consistent scoped release candidate', () => {
    expect(validateReleaseCandidateFiles(BASE)).toMatchObject({
      publicationMode: 'scoped', selectedPlatforms: ['macos'], version: VERSION
    });
  });

  it('rejects package lock and host-visible version drift before T7', () => {
    expect(() => validateReleaseCandidateFiles({
      ...BASE, packageLock: { ...BASE.packageLock, version: '0.8.9' }
    })).toThrow('package-lock.json root versions must match');
    expect(() => validateReleaseCandidateFiles({
      ...BASE, androidGradle: 'versionCode 1\nversionName "0.8.9"\n'
    })).toThrow('Android versionName must match package.json version');
    expect(() => validateReleaseCandidateFiles({
      ...BASE, iosProject: 'MARKETING_VERSION = 0.8.9;\nCURRENT_PROJECT_VERSION = 1;\n'
    })).toThrow('iOS MARKETING_VERSION must match package.json version');
  });

  it('rejects a second compatibility bridge from repository history alone', () => {
    expect(() => validateReleaseCandidateFiles({
      ...BASE,
      intent: {
        ...BASE.intent, publicationMode: 'bridge',
        scopeBasis: { macos: 'bridge', windows: 'bridge' }, selectedPlatforms: ['macos', 'windows']
      }
    })).toThrow('compatibility bridge is already frozen at 0.8.0');
  });
});
