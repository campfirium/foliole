/* global process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export * from '../desktop/playwright-desktop-native-hidden.mjs';
import { runNativeHiddenDesktopGate } from '../desktop/playwright-desktop-native-hidden.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runNativeHiddenDesktopGate({ platform: 'win32' });
}
