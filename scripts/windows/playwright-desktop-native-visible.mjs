/* global process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export * from '../desktop/playwright-desktop-native-visible.mjs';
import { runNativeVisibleDesktopGate } from '../desktop/playwright-desktop-native-visible.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await runNativeVisibleDesktopGate({ platform: 'win32' });
  } catch (error) {
    process.stderr.write(`[desktop-native-visible] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
