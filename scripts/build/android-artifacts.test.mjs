import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { buildAndroidArtifacts } from './android-artifacts.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const parent = path.resolve('.tmp/artifacts/T704');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'shared-build-'));
  roots.push(root);
  return { root,
    apk: path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    androidTestApk: path.join(root, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk') };
}

function produce(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, 'built artifact');
}

it('builds application and instrumentation artifacts through the same source root and environment', () => {
  const subject = fixture();
  const calls = [];
  const stages = [];
  const env = { JAVA_HOME: '/caller/jdk', ANDROID_HOME: '/caller/sdk' };
  const result = buildAndroidArtifacts({ ...subject, includeTests: true, useBuildCache: true,
    env, cap: '/caller/cap', gradle: '/caller/gradlew', onStage: stage => stages.push(stage),
    run(command, args, options) {
      calls.push({ command, args, options });
      if (command === '/caller/gradlew') {
        produce(subject.apk);
        produce(subject.androidTestApk);
      }
    } });
  expect(result).toEqual({ apk: subject.apk, androidTestApk: subject.androidTestApk });
  expect(calls.map(({ command, args }) => [command, args])).toEqual([
    ['npm', ['run', 'android:web:build']], ['/caller/cap', ['sync', 'android']],
    ['/caller/gradlew', ['--no-daemon', '--build-cache', 'assembleDebug', 'assembleDebugAndroidTest']]
  ]);
  expect(calls.map(({ options }) => options)).toEqual([
    { cwd: subject.root, env }, { cwd: subject.root, env }, { cwd: path.join(subject.root, 'android'), env }
  ]);
  expect(stages).toEqual(['web-build', 'capacitor-sync', 'gradle-build', 'apk-check']);
});

it.each([false, true])('rejects missing requested artifacts after Gradle exits successfully: tests=%s', includeTests => {
  const subject = fixture();
  expect(() => buildAndroidArtifacts({ ...subject, includeTests, run: () => {
    if (includeTests) produce(subject.apk);
  } })).toThrow(includeTests ? 'Android test APK was not produced' : 'Debug APK was not produced');
});
