import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { app } from 'electron';

export type MacosGlobalClipPermission = 'denied' | 'granted' | 'unavailable';

export interface MacosGlobalClipCopyResult {
  copyWritten: boolean;
  permission: MacosGlobalClipPermission;
}

const execFileAsync = promisify(execFile);
const HELPER_NAME = 'Foliole Global Capture';

export function resolveMacosGlobalClipHelperPath() {
  return path.join(path.dirname(app.getPath('exe')), HELPER_NAME);
}

export function parseMacosGlobalClipResult(stdout: string): MacosGlobalClipCopyResult {
  const value = JSON.parse(stdout.trim()) as Record<string, unknown>;
  if (!['denied', 'granted', 'unavailable'].includes(String(value.permission))) {
    throw new Error('macOS global capture helper returned an invalid permission');
  }
  if (typeof value.copyWritten !== 'boolean') {
    throw new Error('macOS global capture helper returned an invalid copy result');
  }
  return {
    copyWritten: value.copyWritten,
    permission: value.permission as MacosGlobalClipPermission
  };
}

export async function runMacosGlobalClipCopy(args: {
  exists?: typeof existsSync;
  helperPath?: string;
  mode?: 'capture' | 'preflight';
  run?: typeof execFileAsync;
} = {}): Promise<MacosGlobalClipCopyResult> {
  if (process.platform !== 'darwin' || !app.isPackaged) {
    return { copyWritten: false, permission: 'unavailable' };
  }
  const helperPath = args.helperPath ?? resolveMacosGlobalClipHelperPath();
  if (!(args.exists ?? existsSync)(helperPath)) throw new Error('macOS global capture helper is missing');
  const run = args.run ?? execFileAsync;
  const { stdout } = await run(helperPath, [args.mode === 'preflight' ? '--preflight' : '--capture'], {
    timeout: 1500
  });
  return parseMacosGlobalClipResult(stdout);
}

export async function preflightMacosGlobalClipPermission() {
  try {
    return (await runMacosGlobalClipCopy({ mode: 'preflight' })).permission;
  } catch {
    return 'unavailable' as const;
  }
}
