/* global process */

export const MULTI_DEVICE_ANDROID_APP_ID = 'com.foliole.android.acceptance';
export const MULTI_DEVICE_ANDROID_CLASS_PREFIX = 'com.foliole.android';

export function multiDeviceAndroidEnv(env = process.env) {
  return { ...env,
    FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: MULTI_DEVICE_ANDROID_APP_ID };
}
