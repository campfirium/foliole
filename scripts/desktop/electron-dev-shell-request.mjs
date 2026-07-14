import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ELECTRON_DEV_SHELL_REQUEST_KIND = 'foliole-dev-shell-restart';

export function createElectronDevShellRequest({
  bootSession = null,
  now = () => new Date(),
  reason,
  runtimeHead = null,
  shellAction = 'restart-runtime',
  uuid = randomUUID
}) {
  if (!reason?.trim()) throw new Error('electron dev shell restart reason is required');
  if (!['exit-shell', 'restart-runtime'].includes(shellAction)) {
    throw new Error(`unsupported electron dev shell action: ${shellAction}`);
  }
  return {
    id: uuid(),
    kind: ELECTRON_DEV_SHELL_REQUEST_KIND,
    reason: reason.trim(),
    runtimeHead,
    bootSession,
    shellAction,
    requestedAt: now().toISOString()
  };
}

export async function writeElectronDevShellRequest({ filePath, ...requestOptions }) {
  if (!filePath?.trim()) throw new Error('electron dev shell restart request file is required');
  const request = createElectronDevShellRequest(requestOptions);
  const tempPath = `${filePath}.${request.id}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true });
  }
  return request;
}
