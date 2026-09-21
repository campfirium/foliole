import path from 'node:path';

import { S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';

export function assertS220ApkIdentity({ captured, env, paths }) {
  const analyzer = path.join(env.ANDROID_SDK_ROOT, 'cmdline-tools/latest/bin/apkanalyzer');
  const manifest = (apk) => captured(analyzer, ['manifest', 'print', apk], { env });
  const packageId = (xml) => xml.match(/<manifest\b[^>]*\bpackage="([^"]+)"/u)?.[1];
  const app = manifest(paths.apk);
  const test = manifest(paths.androidTestApk);
  const runners = test.match(/<instrumentation\b[^>]*>/gu) ?? [];
  if (packageId(app) !== S220_APP_ID || packageId(test) !== `${S220_APP_ID}.test`
    || runners.length !== 1 || !runners[0].includes(`android:targetPackage="${S220_APP_ID}"`)
    || !runners[0].includes('android:name="androidx.test.runner.AndroidJUnitRunner"')) {
    throw new Error('S220 APK identities do not match the isolated acceptance target.');
  }
  return { appId: S220_APP_ID, testAppId: `${S220_APP_ID}.test` };
}
