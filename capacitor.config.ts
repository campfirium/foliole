import type { CapacitorConfig } from '@capacitor/cli';

const A5_DEV_SERVER_URL = 'http://127.0.0.1:24605';

export function createCapacitorConfig(env: NodeJS.ProcessEnv = process.env): CapacitorConfig {
  return {
    appId: 'com.foliole.android',
    appName: 'Foliole',
    android: {
      loggingBehavior: 'none'
    },
    plugins: {
      CapacitorSQLite: {
        androidIsEncryption: false,
        iosDatabaseLocation: 'Library/CapacitorDatabase',
        iosIsEncryption: false
      }
    },
    ...(env.FOLIOLE_ANDROID_DEV_LIVE_RELOAD === '1'
      ? { server: { cleartext: true, url: A5_DEV_SERVER_URL } }
      : {}),
    webDir: 'dist/companion'
  };
}

const config = createCapacitorConfig();

export default config;
