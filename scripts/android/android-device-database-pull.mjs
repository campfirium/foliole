/* global console, process */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Pull only the companion database (no attachments) so an acceptance can audit what it wrote. */
export async function pullAndroidDatabase({ adb, appId, serial }) {
  // Loaded on demand so controllers that only parse the CLI result stay free of node:sqlite.
  const { collectAndroidDeviceSnapshot } = await import('./android-device-snapshot.mjs');
  const snapshot = await collectAndroidDeviceSnapshot({ adb, appId, serial, tables: [],
    includeAttachments: false, includeEvents: false, keepPulledDatabase: true });
  if (snapshot.error || !snapshot.database?.path || snapshot.database.integrity !== 'ok') {
    throw new Error(`Android database pull failed: ${snapshot.error ?? snapshot.database?.error ?? 'unreadable'}`);
  }
  return { databasePath: snapshot.database.path };
}

/** Read the pull result printed by this script's CLI. */
export function parseAndroidDatabasePull(stdout) {
  const line = String(stdout).trim().split(/\r?\n/u).at(-1) ?? '';
  const parsed = JSON.parse(line);
  if (typeof parsed.databasePath !== 'string' || !parsed.databasePath) {
    throw new Error('Android database pull did not report a database path.');
  }
  return parsed.databasePath;
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const result = await pullAndroidDatabase({ adb: argumentValue(args, '--adb'),
    appId: argumentValue(args, '--app-id'), serial: argumentValue(args, '--serial') });
  console.log(JSON.stringify(result));
}
