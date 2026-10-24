import type { CapacitorConfig } from '@capacitor/cli';

// The live reload session serves the companion here; Android reaches it through adb reverse.
const DEV_LIVE_RELOAD_URL = 'http://127.0.0.1:24605';

export function createCapacitorConfig(env: NodeJS.ProcessEnv = process.env): CapacitorConfig {
  return {
    appId: 'com.campfirium.foliole.android',
    appName: 'Foliole',
    android: {
      // Native bridge logs serialize complete SQLite results on the WebView thread.
      loggingBehavior: env.FOLIOLE_DEV_LIVE_RELOAD === '1' ? 'debug' : 'none'
    },
    plugins: {
      CapacitorSQLite: {
        androidIsEncryption: false,
        iosDatabaseLocation: 'Library/CapacitorDatabase',
        iosIsEncryption: false
      }
    },
    ...(env.FOLIOLE_DEV_LIVE_RELOAD === '1'
      ? { server: { cleartext: true, url: DEV_LIVE_RELOAD_URL } }
      : {}),
    webDir: 'dist/companion'
  };
}

const config = createCapacitorConfig();

export default config;
