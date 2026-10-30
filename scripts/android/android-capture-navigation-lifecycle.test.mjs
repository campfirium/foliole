// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { macosA5GradleEnv } from './macos-a5-runtime-paths.mjs';

const SOURCE = 'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionCaptureNavigation.java';
const STUBS = {
  'android/app/Instrumentation.java': `package android.app;
    public class Instrumentation { public void sendKeyDownUpSync(int key) {
      com.foliole.android.NavigationHarness.reading=false;
      com.foliole.android.NavigationHarness.backCount++;
    } }`,
  'android/webkit/WebView.java': 'package android.webkit; public class WebView {}',
  'android/view/KeyEvent.java': 'package android.view; public class KeyEvent { public static int KEYCODE_BACK=4; }',
  'org/json/JSONObject.java': `package org.json;
    public class JSONObject { public boolean optBoolean(String key) { return true; }
      public String optString(String key) { return ""; } }`,
  'com/foliole/android/FolioleCompanionWebViewSemanticAdapter.java': `package com.foliole.android;
    final class FolioleCompanionWebViewSemanticAdapter {
      static boolean tryEvaluateBoolean(android.app.Instrumentation i,android.webkit.WebView v,String script) {
        if (script.contains("companion-capture-open")) return !NavigationHarness.reading;
        if (script.contains("companion-article-document")) return NavigationHarness.reading;
        if (script.contains("companion-review-action-read")) return NavigationHarness.flow && NavigationHarness.reading;
        return false;
      }
      static org.json.JSONObject snapshot(android.app.Instrumentation i,android.webkit.WebView v) {
        return new org.json.JSONObject();
      }
      static org.json.JSONObject perform(android.app.Instrumentation i,android.webkit.WebView v,
          String id,String action,String value) {
        throw new AssertionError("No visible navigation control exists in the restored reading surface");
      }
    }`,
  'com/foliole/android/FolioleCompanionCaptureAnnotationScenario.java': `package com.foliole.android;
    final class FolioleCompanionCaptureAnnotationScenario {
      static void perform(android.app.Instrumentation i,android.webkit.WebView v,String id,String a,String value) {}
      static void waitForTestId(android.app.Instrumentation i,android.webkit.WebView v,String id,long timeout) {}
      static void waitFor(android.app.Instrumentation i,android.webkit.WebView v,String s,long timeout,String label) {}
    }`,
  'com/foliole/android/NavigationHarness.java': `package com.foliole.android;
    public class NavigationHarness {
      public static boolean reading,flow;
      public static int backCount;
      public static void main(String[] args) throws Exception {
        reading=!"browse".equals(args[0]); flow="flow".equals(args[0]);
        FolioleCompanionCaptureNavigation.enterBrowseSurface(
          new android.app.Instrumentation(),new android.webkit.WebView(),500);
        if (reading || backCount != ("browse".equals(args[0]) ? 0 : 1))
          throw new AssertionError("Browse was not reached without extra Back actions");
        System.out.println("browse ready");
      }
    }`
};

it.each(['immersive', 'flow', 'browse'])('reaches Browse from %s without requiring visible reading chrome', state => {
  const parent = path.resolve('.tmp/artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'capture-navigation-lifecycle-'));
  const javaHome = process.platform === 'darwin' ? macosA5GradleEnv().JAVA_HOME : process.env.JAVA_HOME;
  const binary = name => javaHome ? path.join(javaHome, 'bin', name) : name;
  try {
    const files = [];
    const source = { ...STUBS,
      'com/foliole/android/FolioleCompanionCaptureNavigation.java': fs.readFileSync(SOURCE, 'utf8') };
    for (const [name, content] of Object.entries(source)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      files.push(file);
    }
    execFileSync(binary('javac'), ['-d', root, ...files], { timeout: 30_000, stdio: 'pipe' });
    const output = execFileSync(binary('java'), ['-cp', root, 'com.foliole.android.NavigationHarness', state],
      { timeout: 10_000, encoding: 'utf8', stdio: 'pipe' });
    expect(output.trim()).toBe('browse ready');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
