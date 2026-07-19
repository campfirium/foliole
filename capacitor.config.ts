import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
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
  webDir: 'dist/companion'
};

export default config;
