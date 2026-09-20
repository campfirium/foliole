import path from 'node:path';

export const PERFORMANCE_APP_ID = 'com.foliole.android.acceptance';

export function performanceScenario(env) {
  const scenario = env.FOLIOLE_DATABASE_PERFORMANCE_SCENARIO ?? 'native-gate';
  if (!['native-gate', 'library-capacity'].includes(scenario)) {
    throw new Error('Unsupported fixed database performance scenario.');
  }
  return scenario;
}

export function assertPerformanceApkIdentity({ captured, paths, env }) {
  const analyzer = path.join(env.ANDROID_SDK_ROOT, 'cmdline-tools/latest/bin/apkanalyzer');
  const read = (apk) => captured(analyzer, ['manifest', 'print', apk], { env });
  const app = read(paths.apk);
  const test = read(paths.androidTestApk);
  const packageId = xml => xml.match(/<manifest\b[^>]*\bpackage="([^"]+)"/u)?.[1];
  const runners = test.match(/<instrumentation\b[^>]*>/gu) ?? [];
  if (packageId(app) !== PERFORMANCE_APP_ID || packageId(test) !== `${PERFORMANCE_APP_ID}.test`
    || runners.length !== 1 || !runners[0].includes(`android:targetPackage="${PERFORMANCE_APP_ID}"`)
    || !runners[0].includes('android:name="androidx.test.runner.AndroidJUnitRunner"')) {
    throw new Error('Performance APK identities do not match the isolated acceptance target.');
  }
  return { appId: PERFORMANCE_APP_ID, testAppId: `${PERFORMANCE_APP_ID}.test` };
}

export function buildA5DatabasePerformance({ checked, captured, paths, env }) {
  const capacity = performanceScenario(env) === 'library-capacity';
  const buildEnv = { ...env, FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: PERFORMANCE_APP_ID,
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: capacity ? '1' : '0',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: capacity ? 'library-capacity' : '' };
  checked('npm', ['run', 'android:web:build'], { cwd: paths.buildRoot, env: buildEnv });
  checked(paths.cap, ['sync', 'android'], { cwd: paths.buildRoot, env: buildEnv });
  checked(paths.gradle, ['--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(paths.buildRoot, 'android'), env: buildEnv
  });
  return assertPerformanceApkIdentity({ captured, paths, env: buildEnv });
}
