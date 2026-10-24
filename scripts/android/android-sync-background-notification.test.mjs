// @vitest-environment node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

function notificationFixture(update, canNotify) {
  return `public class NotificationFixture {
    static Object service;
    static String title, text;
    static int completed, total;
    static final int NOTIFICATION_ID = 4096;
    static class Context { int permission; boolean revoked; int notifications; }
    static class Build {
      static class VERSION { static int SDK_INT = 33; }
      static class VERSION_CODES { static final int TIRAMISU = 33; }
    }
    static class Manifest { static class permission { static final String POST_NOTIFICATIONS = "post"; } }
    static class PackageManager { static final int PERMISSION_GRANTED = 0; }
    static class ContextCompat {
      static int checkSelfPermission(Context context, String permission) { return context.permission; }
    }
    static class NotificationManagerCompat {
      Context context;
      static NotificationManagerCompat from(Context context) {
        NotificationManagerCompat manager = new NotificationManagerCompat(); manager.context = context; return manager;
      }
      void notify(int id, Object notification) {
        if (context.revoked) throw new SecurityException("permission revoked after check");
        context.notifications++;
      }
    }
    static Object notification(Context context) { return new Object(); }
    ${update}
    ${canNotify}
    public static void main(String[] args) {
      Context context = new Context();
      update(context, "Sync", "No service", 0, 10);
      if (context.notifications != 0) throw new AssertionError("Notification without service");
      service = new Object(); context.permission = -1;
      update(context, "Sync", "Denied", 1, 10);
      if (context.notifications != 0) throw new AssertionError("Notification without permission");
      context.permission = 0;
      update(context, "Sync", "Allowed", 2, 10);
      if (context.notifications != 1) throw new AssertionError("Granted notification missing");
      context.revoked = true;
      update(context, "Sync", "Revoked", 3, 10);
      if (context.notifications != 1 || completed != 3) throw new AssertionError("Revocation lost progress");
      context.revoked = false; context.permission = -1; Build.VERSION.SDK_INT = 28;
      update(context, "Sync", "Legacy", 4, 10);
      if (context.notifications != 2) throw new AssertionError("Legacy notification missing");
    }
  }`;
}

it('keeps sync progress safe when notification permission is denied or revoked during update', () => {
  const source = fs.readFileSync('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncBackgroundWork.java', 'utf8');
  const update = source.slice(source.indexOf('static synchronized void update('), source.indexOf('static synchronized void end('));
  const canNotify = source.slice(source.indexOf('private static boolean canNotify('), source.indexOf('private static void createChannel('));
  const artifacts = path.resolve('.tmp/artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const directory = fs.mkdtempSync(path.join(artifacts, 'sync-notification-'));
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  try {
    const file = path.join(directory, 'NotificationFixture.java');
    fs.writeFileSync(file, notificationFixture(update, canNotify));
    const compile = spawnSync(binary('javac'), ['-d', directory, file], { encoding: 'utf8', timeout: 30000 });
    expect(compile.error).toBeUndefined();
    expect(compile.status, compile.stderr).toBe(0);
    const result = spawnSync(binary('java'), ['-cp', directory, 'NotificationFixture'], { encoding: 'utf8', timeout: 5000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});
