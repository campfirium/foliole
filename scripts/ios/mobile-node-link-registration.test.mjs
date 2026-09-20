import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(path, 'utf8');

describe('mobile URL host registration', () => {
  it('registers the same custom scheme on both native hosts', () => {
    const android = read('android/app/src/main/AndroidManifest.xml');
    const ios = read('ios/App/App/Info.plist');
    expect(android).toContain('android.intent.action.VIEW');
    expect(android).toContain('android.intent.category.BROWSABLE');
    expect(android).toContain('android:scheme="foliole" android:host="node" android:path="/v1"');
    expect(android).toContain('android:launchMode="singleTask"');
    expect(ios).toMatch(/<key>CFBundleURLSchemes<\/key>\s*<array><string>foliole<\/string><\/array>/u);
  });
  it('forwards iOS URL events to the Capacitor application delegate', () => {
    expect(read('ios/App/App/AppDelegate.swift'))
      .toContain('ApplicationDelegateProxy.shared.application(app, open: url, options: options)');
  });
});
