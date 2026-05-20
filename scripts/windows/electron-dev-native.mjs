/* global URL, process */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const userDataPath = path.join(repoRoot, '.electron-user-data');

process.env.FOLIOLE_USER_DATA_PATH ??= userDataPath;
process.env.FOLIOLE_SESSION_DATA_PATH ??= process.env.FOLIOLE_USER_DATA_PATH;
process.env.FOLIOLE_BOOT_SESSION ??= `windows-native-${randomUUID()}`;

await import('../electron-dev.mjs');
