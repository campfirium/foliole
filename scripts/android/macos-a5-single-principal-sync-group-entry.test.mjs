import fs from 'node:fs';

import { expect, it } from 'vitest';

it('materializes both isolated Android and hidden Mac runtimes inside the frozen capsule', () => {
  const source = fs.readFileSync(
    'scripts/android/macos-a5-single-principal-sync-group-entry.mjs', 'utf8'
  );
  expect(source).toContain("FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: ACCEPTANCE_APP_ID");
  expect(source).toContain('macosAcceptanceEnv(args.env)');
  expect(source).toContain('assertMacosAcceptanceSyncGroupServer(await session.enable())');
  expect(source).toContain("'--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'");
  expect(source).toContain("['run', 'build']");
  expect(source).toContain("['run', 'electron:compile']");
  expect(source).toContain('openMacosSyncGroupDesktopSession');
  expect(source).toContain('observeConcurrently: true');
  expect(source).toContain("'keyevent', 'KEYCODE_WAKEUP'");
  expect(source).toContain("'wm', 'dismiss-keyguard'");
  expect(source).toContain("'uninstall', ACCEPTANCE_APP_ID");
});
