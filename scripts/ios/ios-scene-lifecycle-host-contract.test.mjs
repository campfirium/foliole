// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadSceneLifecycleState() {
  const infoPlist = read('ios/App/App/Info.plist');
  const appDelegate = read('ios/App/App/AppDelegate.swift');
  return {
    hasConfigurationDelegate: /configurationForConnecting/.test(appDelegate),
    hasSceneManifest: /UIApplicationSceneManifest/.test(infoPlist)
  };
}

function loadIphoneOsSdkMajor() {
  const result = spawnSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Unable to resolve the iPhoneOS SDK version: ${result.stderr.trim()}`);
  }
  const major = Number.parseInt(result.stdout.trim().split('.')[0] ?? '', 10);
  if (!Number.isInteger(major)) throw new Error(`Invalid iPhoneOS SDK version: ${result.stdout.trim()}`);
  return major;
}

describe('iOS scene lifecycle host contract', () => {
  it('does not allow a partial UIScene migration', () => {
    const state = loadSceneLifecycleState();
    expect(state.hasConfigurationDelegate).toBe(state.hasSceneManifest);
  });

  it('requires UIScene before building with the iOS 27 SDK', () => {
    const sdkMajor = loadIphoneOsSdkMajor();
    const state = loadSceneLifecycleState();
    if (sdkMajor >= 27 && (!state.hasSceneManifest || !state.hasConfigurationDelegate)) {
      throw new Error('iOS 27 SDK requires a complete UIScene lifecycle migration before Foliole can launch.');
    }
  });
});
