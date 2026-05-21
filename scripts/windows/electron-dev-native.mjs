/* global process */

import { randomUUID } from 'node:crypto';

import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const { userDataPath } = resolveWindowsNativePaths();

process.env.FOLIOLE_USER_DATA_PATH = userDataPath;
process.env.FOLIOLE_SESSION_DATA_PATH = userDataPath;
process.env.FOLIOLE_BOOT_SESSION ??= `windows-native-${randomUUID()}`;
process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION ??= '1';

await import('../electron-dev.mjs');
