// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('Android API-level resource contract', () => {
  it('keeps the edge-to-edge WebView resize-aware when the software keyboard opens', () => {
    expect(read('android/app/src/main/AndroidManifest.xml')).toContain(
      'android:windowSoftInputMode="adjustResize"'
    );
  });

  it('owns multicast reception only for the bounded Android NSD discovery lifecycle', () => {
    expect(read('android/app/src/main/AndroidManifest.xml')).toContain(
      'android.permission.CHANGE_WIFI_MULTICAST_STATE'
    );
    const discovery = read(
      'android/app/src/main/java/com/foliole/android/FolioleCompanionNsdDiscovery.java'
    );
    expect(discovery).toContain('wifiManager.createMulticastLock("foliole-sync-discovery")');
    expect(discovery).toContain(
      'if (multicastLock != null && multicastLock.isHeld()) multicastLock.release()'
    );
    const session = read(
      'android/app/src/main/java/com/foliole/android/FolioleCompanionNsdDiscoverySession.java'
    );
    expect(session).toContain('createMulticastLock("foliole-sync-discovery-session")');
    expect(session).toContain('releaseMulticastLock();');
  });

  it('serializes Android NSD resolutions across all discovered Device providers', () => {
    const session = read(
      'android/app/src/main/java/com/foliole/android/FolioleCompanionNsdDiscoverySession.java'
    );
    expect(session).toContain('private final Deque<NsdServiceInfo> pendingResolutions');
    expect(session).toContain('if (resolving) return;');
    expect(session).toContain('resolveNext();');
    expect(session).toContain('pendingResolutions.clear();');
    const monitor = read(
      'android/app/src/main/java/com/foliole/android/FolioleCompanionNsdMonitor.java'
    );
    expect(monitor).toContain('synchronized (this)');
    expect(monitor).not.toContain('private synchronized void resolveNext()');
    const plugin = read('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java');
    expect(plugin).toContain('!FolioleCompanionSyncGroupProvider.activeGroupId().isEmpty()');
    expect(plugin).toMatch(/FolioleCompanionSyncGroupProvider\.start[\s\S]+reconcileServiceMonitor\(\)/u);
    expect(plugin).toMatch(/FolioleCompanionSyncGroupProvider\.stop[\s\S]+reconcileServiceMonitor\(\)/u);
  });

  it('limits the API 27 navigation bar attribute to v27 resources', () => {
    expect(read('android/app/src/main/res/values/styles.xml')).not.toContain('windowLightNavigationBar');
    expect(read('android/app/src/main/res/values-night/styles.xml')).not.toContain('windowLightNavigationBar');
    expect(read('android/app/src/main/res/values-v27/styles.xml')).toContain(
      '<item name="android:windowLightNavigationBar">true</item>'
    );
    expect(read('android/app/src/main/res/values-night-v27/styles.xml')).toContain(
      '<item name="android:windowLightNavigationBar">false</item>'
    );
  });
});
