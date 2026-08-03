// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  applyMobileStoreAvailability,
  recordMobileBuildAttempt,
  resolveMobileBuildIdentity,
  validateMobilePlatformVersions
} from './mobile-store-identity-contract.mjs';

const EMPTY_HISTORY = { schemaVersion: 1, attempts: [] };

describe('mobile store build identity', () => {
  it('keeps the product version user-visible while allowing independent build attempts', () => {
    const first = resolveMobileBuildIdentity({
      internalBuildNumber: 41, platform: 'android', productVersion: '0.8.0'
    }, '0.8.0');
    const second = resolveMobileBuildIdentity({
      internalBuildNumber: 42, platform: 'android', productVersion: '0.8.0'
    }, '0.8.0');
    const afterRejection = recordMobileBuildAttempt(
      recordMobileBuildAttempt(EMPTY_HISTORY, first, 'rejected'), second, 'uploaded'
    );

    expect(first.userVisibleVersion).toBe('0.8.0');
    expect(second.userVisibleVersion).toBe('0.8.0');
    expect(afterRejection.attempts.map(({ internalBuildNumber }) => internalBuildNumber)).toEqual(['41', '42']);
  });

  it('rejects reused, decreasing, malformed, and product-divergent identities', () => {
    const identity = resolveMobileBuildIdentity({
      internalBuildNumber: '9', platform: 'ios', productVersion: '0.8.0'
    }, '0.8.0');
    const history = recordMobileBuildAttempt(EMPTY_HISTORY, identity, 'rejected');
    expect(() => recordMobileBuildAttempt(history, identity, 'uploaded')).toThrow('must increase');
    expect(() => recordMobileBuildAttempt(history, { ...identity, internalBuildNumber: '8' }, 'uploaded'))
      .toThrow('must increase');
    expect(() => resolveMobileBuildIdentity({
      internalBuildNumber: '1.2', platform: 'ios', productVersion: '0.8.0'
    }, '0.8.0')).toThrow('positive integer');
    expect(() => resolveMobileBuildIdentity({
      internalBuildNumber: '10', platform: 'ios', productVersion: '0.8.1'
    }, '0.8.0')).toThrow('match package.json');
  });

  it('advances public store state only after the build is actually available', () => {
    const identity = resolveMobileBuildIdentity({
      internalBuildNumber: '12', platform: 'ios', productVersion: '0.8.0'
    }, '0.8.0');
    const directory = { schemaVersion: 1, platforms: { ios: { channel: 'app-store', status: 'unavailable' } } };

    expect(applyMobileStoreAvailability(directory, identity, 'approved')).toEqual(directory);
    expect(applyMobileStoreAvailability(directory, identity, 'rejected')).toEqual(directory);
    expect(applyMobileStoreAvailability(directory, identity, 'available').platforms.ios).toEqual({
      channel: 'app-store', status: 'available', version: '0.8.0'
    });
  });

  it('keeps Android and iOS platform configuration aligned to the product version', async () => {
    const [androidGradle, iosInfoPlist, iosProject, packageJson] = await Promise.all([
      readFile('android/app/build.gradle', 'utf8'),
      readFile('ios/App/App/Info.plist', 'utf8'),
      readFile('ios/App/App.xcodeproj/project.pbxproj', 'utf8'),
      readFile('package.json', 'utf8').then(JSON.parse)
    ]);

    expect(validateMobilePlatformVersions({
      androidGradle, iosInfoPlist, iosProject, packageVersion: packageJson.version
    })).toEqual({
      android: { internalBuildNumber: '1', userVisibleVersion: packageJson.version },
      ios: { internalBuildNumber: '1', userVisibleVersion: packageJson.version }
    });
  });
});
