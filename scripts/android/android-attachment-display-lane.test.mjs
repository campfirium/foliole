// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { jvmStderr } from './jvm-output-fixture.mjs';

const root = path.resolve('android/app/src/main/java/com/foliole/android');

function pluginMethod(plugin, signature) {
  const start = plugin.indexOf(signature);
  expect(start).toBeGreaterThan(0);
  const next = plugin.indexOf('\n    @', start + 1);
  const close = plugin.indexOf('\n    private ', start + 1);
  const ends = [next, close].filter(index => index > start);
  return plugin.slice(start, Math.min(...ends)).trim();
}

function fixtureSource() {
  const plugin = fs.readFileSync(path.join(root, 'FolioleCompanionSyncPlugin.java'), 'utf8');
  const executors = plugin.match(/^ {4}private final ExecutorService \w+ = Executors\.newSingleThreadExecutor\(\);$/gm);
  expect(executors?.length).toBeGreaterThan(0);
  const methods = [
    '@PluginMethod public void maintainAttachmentFiles(',
    '@PluginMethod public void writeImageAttachment(',
    '@PluginMethod public void resolveAttachmentResource(',
    'private void async('
  ].map(signature => pluginMethod(plugin, signature));
  return `package com.foliole.android;
    import com.getcapacitor.JSObject;
    import com.getcapacitor.PluginCall;
    import java.util.concurrent.*;
    @interface PluginMethod {}
    final class BuildConfig { static final boolean DEBUG = false; }
    final class Gate {
      static final CountDownLatch maintenanceEntered = new CountDownLatch(1);
      static final CountDownLatch release = new CountDownLatch(1);
      static final java.util.concurrent.atomic.AtomicInteger maintenanceStarts = new java.util.concurrent.atomic.AtomicInteger();
      static void hang() throws Exception { if (!release.await(10, TimeUnit.SECONDS)) throw new AssertionError("Gate never released"); }
    }
    class FolioleAttachmentMaintenanceFiles {
      static JSObject execute(Object context, PluginCall call) throws Exception {
        Gate.maintenanceStarts.incrementAndGet(); Gate.maintenanceEntered.countDown(); Gate.hang(); return new JSObject();
      }
    }
    class FolioleRemoteImageFiles {
      static JSObject write(Object context, PluginCall call) throws Exception { Gate.hang(); return new JSObject(); }
    }
    class FolioleCompanionResourcePluginActions {
      static JSObject resolveAttachmentResource(Object context, PluginCall call) { return new JSObject(); }
    }
    public class DisplayLaneFixture {
      ${executors.join('\n')}
      Object getContext() { return null; }
      ${methods.join('\n')}
      public static void main(String[] args) throws Exception {
        DisplayLaneFixture plugin = new DisplayLaneFixture();
        try {
          plugin.maintainAttachmentFiles(new PluginCall());
          if (!Gate.maintenanceEntered.await(2, TimeUnit.SECONDS)) throw new AssertionError("Maintenance never started");
          PluginCall second = new PluginCall();
          plugin.maintainAttachmentFiles(second);
          plugin.writeImageAttachment(new PluginCall());
          PluginCall display = new PluginCall();
          plugin.resolveAttachmentResource(display);
          if (!display.settled.await(2, TimeUnit.SECONDS)) throw new AssertionError("Display waited for maintenance");
          if (display.rejection != null) throw new AssertionError("Display rejected: " + display.rejection);
          if (Gate.maintenanceStarts.get() != 1) throw new AssertionError("Maintenance overlapped while hung");
          Gate.release.countDown();
          if (!second.settled.await(5, TimeUnit.SECONDS)) throw new AssertionError("Queued maintenance never ran");
          System.out.println("Display resolved while maintenance and image write were hung");
        } finally {
          Gate.release.countDown();
          for (java.lang.reflect.Field field : DisplayLaneFixture.class.getDeclaredFields()) {
            if (ExecutorService.class.isAssignableFrom(field.getType())) ((ExecutorService) field.get(plugin)).shutdownNow();
          }
        }
      }
    }`;
}

const capacitorStubs = {
  'Log.java': 'package android.util; public final class Log { public static int d(String tag, String text) { return 0; } }',
  'SystemClock.java': 'package android.os; public final class SystemClock { public static long elapsedRealtime() { return System.nanoTime() / 1000000L; } }',
  'JSObject.java': 'package com.getcapacitor; public class JSObject { public JSObject put(String key, Object value) { return this; } }',
  'PluginCall.java': `package com.getcapacitor;
    public class PluginCall {
      public final java.util.concurrent.CountDownLatch settled = new java.util.concurrent.CountDownLatch(1);
      public volatile String rejection;
      public String getMethodName() { return "fixture"; }
      public void resolve(JSObject value) { settled.countDown(); }
      public void reject(String message, Exception cause) { rejection = message; settled.countDown(); }
    }`
};

it('resolves image display while attachment maintenance and image writes are hung', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-display-lane-'));
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  try {
    const sources = Object.entries({ ...capacitorStubs, 'DisplayLaneFixture.java': fixtureSource() })
      .map(([name, text]) => { const file = path.join(directory, name); fs.writeFileSync(file, text); return file; });
    const compiled = spawnSync(binary('javac'), ['-d', directory, ...sources,
      path.join(root, 'FolioleCompanionSyncAsync.java'), path.join(root, 'FolioleCompanionPluginErrors.java')],
    { encoding: 'utf8', timeout: 30000 });
    expect(compiled.error ?? jvmStderr(compiled.stderr)).toBe('');
    expect(compiled.status).toBe(0);
    const result = spawnSync(binary('java'), ['-cp', directory, 'com.foliole.android.DisplayLaneFixture'],
      { encoding: 'utf8', timeout: 15000 });
    expect(jvmStderr(result.stderr)).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Display resolved while maintenance and image write were hung');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
