/* global process */

export const MULTI_DEVICE_ANDROID_APP_ID = 'com.foliole.android.acceptance';
export const MULTI_DEVICE_ANDROID_CLASS_PREFIX = 'com.foliole.android';
export const MULTI_DEVICE_ANDROID_SYNC_PORT = '38644';

export function multiDeviceAndroidEnv(env = process.env) {
  return { ...env,
    FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: MULTI_DEVICE_ANDROID_APP_ID,
    FOLIOLE_ANDROID_COMPANION_SYNC_PORT: MULTI_DEVICE_ANDROID_SYNC_PORT };
}
