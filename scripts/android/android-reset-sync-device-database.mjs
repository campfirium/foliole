import { readFile, writeFile } from 'node:fs/promises';

import { runAdb, spawnAdb } from './android-adb-command.mjs';

const DEVICE_DB_PATHS = [
  'databases/foliole-companionSQLite.db',
  'databases/foliole-companion.db'
];

export async function pullResetDeviceDatabase(options, destination) {
  let lastError = null;
  for (const devicePath of DEVICE_DB_PATHS) {
    try {
      const { stdout } = await runAdb(
        options,
        ['exec-out', 'run-as', options.appId, 'cat', devicePath],
        { encoding: 'buffer' }
      );
      assertSqliteDatabase(stdout, devicePath);
      await writeFile(destination, stdout);
      return { devicePath };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No Android companion database was readable with run-as.${lastError ? ` Last error: ${lastError.message}` : ''}`);
}

export async function writeResetDeviceDatabase(options, databasePath, devicePath) {
  const body = await readFile(databasePath);
  await runAdb(options, ['shell', 'am', 'force-stop', options.appId]);
  await spawnAdb(options, ['exec-in', 'run-as', options.appId, 'sh', '-c', `cat > ${devicePath}`], body);
  await runAdb(options, ['shell', 'run-as', options.appId, 'rm', '-f', `${devicePath}-wal`, `${devicePath}-shm`]);
  await runAdb(options, ['shell', 'run-as', options.appId, 'rm', '-rf', 'files/attachments']);
  await runAdb(options, ['shell', 'run-as', options.appId, 'mkdir', '-p', 'files/attachments']);
}

function assertSqliteDatabase(buffer, devicePath) {
  if (buffer.subarray(0, 16).toString('utf8') === 'SQLite format 3\0') return;
  const preview = buffer.subarray(0, 80).toString('utf8').replace(/\s+/g, ' ').trim();
  throw new Error(`${devicePath} is not a SQLite database${preview ? ` (${preview})` : ''}`);
}
