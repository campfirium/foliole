import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.foliole.android',
  appName: 'Foliole',
  android: {
    loggingBehavior: 'none'
  },
  webDir: 'dist/companion'
};

export default config;
