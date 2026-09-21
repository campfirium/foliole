import { expect, it, vi } from 'vitest';

import { assertS220ApkIdentity } from './macos-a5-s220-apk-identity.mjs';

const APP = 'com.foliole.android.s220acceptance';
const runner = `<instrumentation android:targetPackage="${APP}" `
  + 'android:name="androidx.test.runner.AndroidJUnitRunner" />';

it('allows only the isolated app and its matching test runner', () => {
  const args = { env: { ANDROID_SDK_ROOT: '/sdk' },
    paths: { apk: 'app.apk', androidTestApk: 'test.apk' },
    captured: vi.fn((_cmd, argv) => argv.at(-1) === 'app.apk'
      ? `<manifest package="${APP}"></manifest>`
      : `<manifest package="${APP}.test">${runner}</manifest>`) };
  expect(assertS220ApkIdentity(args)).toEqual({ appId: APP, testAppId: `${APP}.test` });
  args.captured = vi.fn((_cmd, argv) => argv.at(-1) === 'app.apk'
    ? '<manifest package="com.foliole.android"></manifest>'
    : `<manifest package="${APP}.test">${runner}</manifest>`);
  expect(() => assertS220ApkIdentity(args)).toThrow(/identities/);
});
