/* global process */

import { randomUUID } from 'node:crypto';

import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const { userDataPath } = resolveWindowsNativePaths();

process.env.FOLIOLE_USER_DATA_PATH ??= userDataPath;
process.env.FOLIOLE_SESSION_DATA_PATH ??= process.env.FOLIOLE_USER_DATA_PATH;
process.env.FOLIOLE_BOOT_SESSION ??= `windows-native-${randomUUID()}`;

await import('../electron-dev.mjs');
