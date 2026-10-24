/* global process */

export const A5_DAILY_APP_ID = 'com.campfirium.foliole.android';
export const A5_TEST_APP_ID = 'com.campfirium.foliole.android.acceptance';
const A5_TEST_SYNC_PORT = '38644';
const IDENTITY_KEY = 'FOLIOLE_A5_APP_IDENTITY';
const BUILD_KEYS = ['FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID', 'FOLIOLE_ANDROID_COMPANION_SYNC_PORT'];
const TEST_IDENTITY_ACTIONS = new Set([
  'deploy', 'capture-annotation', 'preview-pull', 'system-entry-sync', 'sync-existing',
  'sync-group-join-prepare'
]);
const TEST_ONLY_ACTIONS = new Set(['reset-test-app']);

export function resolveMacosA5Identity(action, requested) {
  if (TEST_ONLY_ACTIONS.has(action)) return 'test';
  const identity = requested ?? 'daily';
  if (identity === 'test' && !TEST_IDENTITY_ACTIONS.has(action)) {
    throw new Error(`${action} does not run against the A5 test application.`);
  }
  return identity;
}

// Daily runs keep the caller's build variables; the test app never shares the daily package or port.
export function macosA5IdentityEnv(env, identity) {
  const next = { ...env };
  delete next[IDENTITY_KEY];
  if (identity !== 'test') return next;
  return { ...next, [IDENTITY_KEY]: 'test', [BUILD_KEYS[0]]: A5_TEST_APP_ID,
    [BUILD_KEYS[1]]: A5_TEST_SYNC_PORT };
}

export function macosA5AppId(env = process.env) {
  return env?.[IDENTITY_KEY] === 'test' ? A5_TEST_APP_ID : A5_DAILY_APP_ID;
}
