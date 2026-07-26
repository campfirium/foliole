/* global console, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runMacosAndroidHost() {
  console.error('[macos-android-host] refused: macOS is controller-only for Android. Use scripts/windows/windows-android-lab-control.mjs.');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command = '', ...args] = process.argv.slice(2);
  try {
    process.exitCode = await runMacosAndroidHost(command, args);
  } catch (error) {
    console.error(`[android-host] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
