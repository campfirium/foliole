// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('preserves the send lease rejection through the actual maintenance callback', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-maintenance-error-'));
  const root = path.resolve('android/app/src/main/java/com/foliole/android');
  const plugin = fs.readFileSync(path.join(root, 'FolioleCompanionSyncPlugin.java'), 'utf8');
  const start = plugin.indexOf('@PluginMethod public void maintainAttachmentFiles(');
  expect(start).toBeGreaterThan(0);
  const end = plugin.indexOf('@PluginMethod', start + 1);
  const method = plugin.slice(start, end).trim();
  const source = `package com.foliole.android;
    @interface PluginMethod {}
    class PluginCall {
      String message;
      public void resolve(Object value) { throw new AssertionError("Removal succeeded"); }
      public void reject(String value, Exception cause) { message = value; }
    }
    class FolioleAttachmentMaintenanceFiles {
      static Object execute(Object context, PluginCall call) {
        throw new IllegalStateException("attachment_send_busy");
      }
    }
    public class MaintenanceFixture {
      private final java.util.concurrent.Executor fileExecutor = Runnable::run;
      Object getContext() { return null; }
      ${method}
      public static void main(String[] args) {
        PluginCall call = new PluginCall();
        new MaintenanceFixture().maintainAttachmentFiles(call);
        if (call.message == null || !call.message.contains("attachment_send_busy")) {
          throw new AssertionError("Lease reason hidden: " + call.message);
        }
        System.out.println("Lease reason reaches JavaScript rejection");
      }
    }`;
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  try {
    const fixture = path.join(directory, 'MaintenanceFixture.java');
    fs.writeFileSync(fixture, source);
    const compiled = spawnSync(binary('javac'), ['-d', directory,
      fixture, path.join(root, 'FolioleCompanionPluginErrors.java')], { encoding: 'utf8', timeout: 30000 });
    expect(compiled.error ?? compiled.stderr).toBe('');
    expect(compiled.status).toBe(0);
    const result = spawnSync(binary('java'), ['-cp', directory,
      'com.foliole.android.MaintenanceFixture'], { encoding: 'utf8', timeout: 5000 });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Lease reason reaches JavaScript rejection');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
