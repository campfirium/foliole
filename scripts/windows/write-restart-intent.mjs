/* global console */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const DEV_RESTART_INTENT_FILE = '.windows-dev-restart-intent.json';
export const DEV_RESTART_INTENT_KIND = 'foliole.electron.dev.restart-intent.v1';

export function resolveRestartIntentPath(rootDir) {
  return path.join(rootDir, DEV_RESTART_INTENT_FILE);
}

export function parseRestartIntentNonce(content) {
  try {
    const parsed = JSON.parse(content);
    const nonce = Number(parsed?.nonce);
    if (!Number.isSafeInteger(nonce) || nonce < 0) {
      return 0;
    }
    return nonce;
  } catch {
    return 0;
  }
}

export async function readRestartIntentNonce(filePath) {
  try {
    return parseRestartIntentNonce(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

export function createRestartIntent({ head, nonce, reason, requestedAt, requestedBy }) {
  return {
    kind: DEV_RESTART_INTENT_KIND,
    target: 'electron-dev',
    nonce,
    requestedAt,
    requestedBy,
    head: head || null,
    reason
  };
}

export async function writeRestartIntent({
  head,
  reason,
  requestedBy = 'wsl-windows-preview',
  rootDir
}) {
  if (!rootDir || rootDir.trim().length === 0) {
    throw new Error('restart intent root dir is required');
  }
  if (!reason || reason.trim().length === 0) {
    throw new Error('restart intent reason is required');
  }

  const filePath = resolveRestartIntentPath(rootDir);
  await mkdir(rootDir, { recursive: true });
  const nonce = (await readRestartIntentNonce(filePath)) + 1;
  const intent = createRestartIntent({
    head,
    nonce,
    reason,
    requestedAt: new Date().toISOString(),
    requestedBy
  });
  await writeFile(filePath, `${JSON.stringify(intent, null, 2)}\n`, 'utf8');
  return { filePath, intent };
}

async function main(env = process.env) {
  const result = await writeRestartIntent({
    head: env.FOLIOLE_RESTART_INTENT_HEAD ?? '',
    reason: env.FOLIOLE_RESTART_INTENT_REASON ?? '',
    requestedBy: env.FOLIOLE_RESTART_INTENT_REQUESTED_BY ?? 'wsl-windows-preview',
    rootDir: env.FOLIOLE_RESTART_INTENT_ROOT ?? ''
  });

  console.log(
    `[windows-restart-intent] status: REQUESTED nonce=${result.intent.nonce} path=${result.filePath}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `[windows-restart-intent] status: REQUEST_FAILED reason=${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
