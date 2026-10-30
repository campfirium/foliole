// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { macosA5GradleEnv } from './macos-a5-runtime-paths.mjs';

const SOURCE = 'android/app/src/androidTest/java/com/foliole/android/FolioleAcceptanceSyncEventProjectionTest.java';
const STUBS = {
  'android/app/Instrumentation.java': `package android.app;
    public class Instrumentation {
      public android.content.Context getTargetContext() { return new android.content.Context(); }
      public Activity startActivitySync(android.content.Intent intent) { throw new IllegalStateException("UI unavailable"); }
      public void runOnMainSync(Runnable action) { action.run(); }
      public void sendStatus(int code, android.os.Bundle bundle) {
        if (code != 2 || !"projected-events".equals(bundle.values.get("folioleActionReceipt")))
          throw new AssertionError("Sync events were not projected");
        System.out.println("events projected without activity navigation");
      }
    }`,
  'android/app/Activity.java': `package android.app;
    public class Activity { public android.webkit.WebView findViewById(int id) { return null; }
      public void finish() {} }`,
  'android/content/Context.java': `package android.content;
    public class Context {
      public String getPackageName() { return "com.campfirium.foliole.android.acceptance"; }
      public PackageManager getPackageManager() { return new PackageManager(); }
      public static class PackageManager {
        public Intent getLaunchIntentForPackage(String name) { return new Intent(); }
      }
    }`,
  'android/content/Intent.java': `package android.content;
    public class Intent { public static int FLAG_ACTIVITY_NEW_TASK=1, FLAG_ACTIVITY_CLEAR_TASK=2;
      public void addFlags(int flags) {} }`,
  'android/os/Bundle.java': `package android.os;
    public class Bundle { public java.util.Map<String,String> values=new java.util.HashMap<>();
      public void putString(String key,String value) { values.put(key,value); } }`,
  'android/webkit/WebView.java': 'package android.webkit; public class WebView {}',
  'androidx/test/ext/junit/runners/AndroidJUnit4.java':
    'package androidx.test.ext.junit.runners; public class AndroidJUnit4 {}',
  'androidx/test/platform/app/InstrumentationRegistry.java': `package androidx.test.platform.app;
    public class InstrumentationRegistry { public static android.app.Instrumentation getInstrumentation() {
      return new android.app.Instrumentation(); } }`,
  'org/json/JSONObject.java': `package org.json;
    public class JSONObject { public String toString() { return "{}"; } }`,
  'org/junit/Test.java': 'package org.junit; public @interface Test {}',
  'org/junit/runner/RunWith.java': 'package org.junit.runner; public @interface RunWith { Class<?> value(); }',
  'com/foliole/android/R.java': 'package com.foliole.android; final class R { static class id { static int webview=1; } }',
  'com/foliole/android/FolioleCompanionCaptureNavigation.java': `package com.foliole.android;
    final class FolioleCompanionCaptureNavigation {
      static void enterBrowseSurface(android.app.Instrumentation i,android.webkit.WebView v,long timeout) {
        throw new IllegalStateException("Browse unavailable while reading");
      }
    }`,
  'com/foliole/android/FolioleAcceptanceSyncEventProjection.java': `package com.foliole.android;
    final class FolioleAcceptanceSyncEventProjection {
      static Object read(android.content.Context context) { return "projected-events"; }
    }`,
  'com/foliole/android/ProjectionHarness.java': `package com.foliole.android;
    public class ProjectionHarness { public static void main(String[] args) throws Exception {
      new FolioleAcceptanceSyncEventProjectionTest().projectsSyncEventsForAcceptance();
    } }`
};

it('projects stored sync events when activity startup and Browse navigation are unavailable', () => {
  const parent = path.resolve('.tmp/artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'sync-projection-lifecycle-'));
  const javaHome = process.platform === 'darwin' ? macosA5GradleEnv().JAVA_HOME : process.env.JAVA_HOME;
  const binary = name => javaHome ? path.join(javaHome, 'bin', name) : name;
  try {
    const files = [];
    const source = { ...STUBS,
      'com/foliole/android/FolioleAcceptanceSyncEventProjectionTest.java': fs.readFileSync(SOURCE, 'utf8') };
    for (const [name, content] of Object.entries(source)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      files.push(file);
    }
    execFileSync(binary('javac'), ['-d', root, ...files], { timeout: 30_000, stdio: 'pipe' });
    const output = execFileSync(binary('java'), ['-cp', root, 'com.foliole.android.ProjectionHarness'],
      { timeout: 10_000, encoding: 'utf8', stdio: 'pipe' });
    expect(output.trim()).toBe('events projected without activity navigation');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
