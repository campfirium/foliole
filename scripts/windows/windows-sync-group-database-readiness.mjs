import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export async function waitForWindowsDatabaseFile(databasePath, {
  exists = fs.existsSync, pause = delay, timeoutMs = 30_000
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exists(databasePath)) return databasePath;
    await pause(100);
  }
  throw new Error('Windows C isolated database did not become ready.');
}
