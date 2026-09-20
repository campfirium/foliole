import { expect, it, vi } from 'vitest';
import { assertPerformanceApkIdentity, buildA5DatabasePerformance } from './a5-database-performance-build.mjs';

const appId = 'com.foliole.android.acceptance';
const env = { ANDROID_SDK_ROOT: '/sdk', FOLIOLE_DATABASE_PERFORMANCE_SCENARIO: 'library-capacity' };
const paths = { apk: '/app.apk', androidTestApk: '/test.apk', buildRoot: '/repo', cap: '/cap', gradle: '/gradle' };
const manifests = apk => apk === paths.apk ? `<manifest package="${appId}"/>`
  : `<manifest package="${appId}.test"><instrumentation android:targetPackage="${appId}" android:name="androidx.test.runner.AndroidJUnitRunner"/></manifest>`;

it('binds every build stage to the fixed acceptance identity and resource', () => {
  const checked = vi.fn();
  const captured = vi.fn((_command, args) => manifests(args.at(-1)));
  expect(buildA5DatabasePerformance({ checked, captured, paths, env }).appId).toBe(appId);
  for (const [, , options] of checked.mock.calls) {
    expect(options.env.FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID).toBe(appId);
    expect(options.env.VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO).toBe('library-capacity');
  }
  expect(captured).toHaveBeenCalledTimes(2);
});

it.each(['app', 'runner'])('rejects the %s APK targeting the main app', target => {
  const captured = (_command, args) => {
    const apk = args.at(-1);
    const xml = manifests(apk);
    return (target === 'app' ? apk === paths.apk : apk === paths.androidTestApk)
      ? xml.replaceAll(appId, 'com.foliole.android') : xml;
  };
  expect(() => assertPerformanceApkIdentity({ captured, paths, env })).toThrow('identities');
});

it('rejects unknown measurement inputs before building', () => {
  const checked = vi.fn();
  expect(() => buildA5DatabasePerformance({ checked, paths,
    env: { ...env, FOLIOLE_DATABASE_PERFORMANCE_SCENARIO: 'arbitrary' } })).toThrow('Unsupported');
  expect(checked).not.toHaveBeenCalled();
});
