/* global console */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const DEV_RENDERER_RELOAD_INTENT_FILE = '.windows-dev-renderer-reload-intent.json';
export const DEV_RENDERER_RELOAD_INTENT_KIND = 'foliole.electron.dev.renderer-reload-intent.v1';

export function resolveRendererReloadIntentPath(rootDir) {
  return path.join(rootDir, DEV_RENDERER_RELOAD_INTENT_FILE);
}

export function parseRendererReloadIntentNonce(content) {
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

export async function readRendererReloadIntentNonce(filePath) {
  try {
    return parseRendererReloadIntentNonce(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

export function createRendererReloadIntent({ head, nonce, reason, requestedAt, requestedBy }) {
  return {
    kind: DEV_RENDERER_RELOAD_INTENT_KIND,
    target: 'electron-dev-renderer',
    nonce,
    requestedAt,
    requestedBy,
    head: head || null,
    reason
  };
}

export async function writeRendererReloadIntent({
  head,
  reason,
  requestedBy = 'wsl-windows-preview',
  rootDir
}) {
  if (!rootDir || rootDir.trim().length === 0) {
    throw new Error('renderer reload intent root dir is required');
  }
  if (!reason || reason.trim().length === 0) {
    throw new Error('renderer reload intent reason is required');
  }

  const filePath = resolveRendererReloadIntentPath(rootDir);
  await mkdir(rootDir, { recursive: true });
  const nonce = (await readRendererReloadIntentNonce(filePath)) + 1;
  const intent = createRendererReloadIntent({
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
  const result = await writeRendererReloadIntent({
    head: env.FOLIOLE_RENDERER_RELOAD_INTENT_HEAD ?? '',
    reason: env.FOLIOLE_RENDERER_RELOAD_INTENT_REASON ?? '',
    requestedBy: env.FOLIOLE_RENDERER_RELOAD_INTENT_REQUESTED_BY ?? 'wsl-windows-preview',
    rootDir: env.FOLIOLE_RENDERER_RELOAD_INTENT_ROOT ?? ''
  });

  console.log(
    `[windows-renderer-reload-intent] status: REQUESTED nonce=${result.intent.nonce} path=${result.filePath}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `[windows-renderer-reload-intent] status: REQUEST_FAILED reason=${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
