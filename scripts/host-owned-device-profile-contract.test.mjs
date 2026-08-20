// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path) {
  return readFile(path, 'utf8');
}

describe('host-owned device profile sources', () => {
  it('uses the normalized desktop hostname and never lazily creates a random current profile', async () => {
    const [identity, payloads] = await Promise.all([
      source('electron/database/deviceIdentity.ts'),
      source('electron/sync/companionLanPayloads.ts')
    ]);
    expect(payloads).toContain("replace(/\\.local$/iu, '')");
    expect(identity).not.toContain('randomUUID');
    expect(identity).toContain('Desktop device profile is unavailable before database initialization.');
  });

  it('uses Android manufacturer/model without legacy SharedPreferences device identity', async () => {
    const bootstrap = await source(
      'android/app/src/main/java/com/foliole/android/FolioleCompanionBootstrapState.java'
    );
    expect(bootstrap).toContain('Build.MANUFACTURER');
    expect(bootstrap).toContain('Build.MODEL');
    expect(bootstrap).not.toContain('DEVICE_ID_KEY');
    expect(bootstrap).not.toContain('SharedPreferences');
    expect(bootstrap).not.toContain('UUID.randomUUID');
  });

  it('uses the iOS system-visible name without requesting a user-assigned-name entitlement', async () => {
    const [bootstrap, project] = await Promise.all([
      source('ios/App/App/FolioleCompanionBootstrapPlugin.swift'),
      source('ios/App/App.xcodeproj/project.pbxproj')
    ]);
    expect(bootstrap).toContain('UIDevice.current.name');
    expect(bootstrap).not.toContain('legacyDeviceIdKey');
    expect(bootstrap).not.toContain('UserDefaults');
    expect(bootstrap).not.toContain('UUID().uuidString');
    expect(project).not.toContain('com.apple.developer.device-information.user-assigned-device-name');
  });
});
