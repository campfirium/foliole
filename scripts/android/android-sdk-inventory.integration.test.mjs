// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { execute } from './macos-a5-process.mjs';

it.runIf(process.platform !== 'win32')('reports the SDK used by a real Android application through the public AGP API', async () => {
  const artifacts = path.resolve('.tmp/artifacts/T680/sdk-inventory-tests');
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(path.join(artifacts, 'application-'));
  const env = process.env;
  const agp = readFileSync('android/build.gradle', 'utf8').match(/com.android.tools.build:gradle:([\d.]+)/u)[1];
  try {
    mkdirSync(path.join(root, 'app/src/main'), { recursive: true });
    writeFileSync(path.join(root, 'settings.gradle'), "rootProject.name = 'sdk-inventory'\ninclude ':app'\n");
    writeFileSync(path.join(root, 'build.gradle'), `buildscript {
      repositories { google(); mavenCentral() }
      dependencies { classpath 'com.android.tools.build:gradle:${agp}' }
    }
    allprojects { repositories { google(); mavenCentral() } }`);
    writeFileSync(path.join(root, 'app/build.gradle'), `apply plugin: 'com.android.application'
      android { namespace 'example.inventory'; compileSdk 36
        defaultConfig { minSdk 28; targetSdk 36 }
      }`);
    writeFileSync(path.join(root, 'app/src/main/AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>');
    const inventoryPath = path.join(root, 'inventory.json');
    const result = await execute(path.resolve('android/gradlew'), ['--no-daemon', '--no-configuration-cache', '--console=plain',
      '-p', root, '-I', path.resolve('scripts/android/android-dependency-inventory.gradle'),
      'folioleSecurityDependencies', `-PfolioleSecurityReport=${inventoryPath}`], { cwd: root, env, timeoutMs: 90000 });
    expect(result.code, result.output).toBe(0);
    const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
    expect(inventory.android).toContainEqual({ project: ':app', compileSdk: 'android-36',
      buildTools: expect.stringMatching(/^36\./u), sdkDirectory: realpathSync(env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT) });
    expect(inventory.configurations.filter(row => row.kind === 'runtime').map(row => row.status)).toEqual(['resolved', 'resolved']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 90000);
