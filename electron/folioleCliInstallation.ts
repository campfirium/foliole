import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { app, dialog, type BrowserWindow } from 'electron';

import type { NativeFolioleCliInstallState } from '../lib/platform/nativeUtilityCommandMap.js';

export interface CliReceipt { bookmark: string; directory: string; target: string }
type CliAction = 'install' | 'remove' | 'repair' | 'status';
const RECEIPT_FILE = 'foliole-cli-installation.json';

function result(status: NativeFolioleCliInstallState['status'], commandPath: string | null = null,
  error: NativeFolioleCliInstallState['error'] = null, packageManaged = false): NativeFolioleCliInstallState {
  return { commandPath, error, packageManaged, status };
}

const LINUX_CLI_COMMAND = '/usr/bin/foliole';
const LINUX_CLI_TARGET = '/opt/Foliole/bin/foliole';

async function inspectLinuxPackageCli() {
  try {
    await fs.access(LINUX_CLI_COMMAND, constants.X_OK);
    const target = await fs.realpath(LINUX_CLI_COMMAND);
    return target === LINUX_CLI_TARGET
      ? result('installed', LINUX_CLI_COMMAND, null, true)
      : result('not_installed', LINUX_CLI_COMMAND, 'failed', true);
  } catch {
    return result('not_installed', LINUX_CLI_COMMAND, null, true);
  }
}

export function resolvePackagedFolioleCliPath(resourcesPath = process.resourcesPath) {
  const pathApi = resourcesPath.includes('\\') ? path.win32 : path.posix;
  return pathApi.resolve(resourcesPath, '../Helpers/Foliole CLI.app/Contents/MacOS/foliole');
}

async function readReceipt(filePath: string): Promise<CliReceipt | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as Partial<CliReceipt>;
    return typeof parsed.bookmark === 'string' && typeof parsed.directory === 'string' &&
      typeof parsed.target === 'string' ? parsed as CliReceipt : null;
  } catch {
    return null;
  }
}

async function writeReceipt(filePath: string, receipt: CliReceipt) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
}

async function readManagedTarget(commandPath: string) {
  try {
    const stat = await fs.lstat(commandPath);
    if (!stat.isSymbolicLink()) return { kind: 'conflict' as const, target: null };
    const target = await fs.readlink(commandPath);
    return { kind: 'link' as const, target: path.resolve(path.dirname(commandPath), target) };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { kind: 'missing' as const, target: null }
      : { kind: 'conflict' as const, target: null };
  }
}

export async function inspectFolioleCliInstallation(receipt: CliReceipt | null, currentTarget: string) {
  if (!receipt) return result('not_installed');
  const commandPath = path.join(receipt.directory, 'foliole');
  const link = await readManagedTarget(commandPath);
  if (link.kind === 'conflict') return result('conflict', commandPath, 'conflict');
  if (link.kind === 'link' && link.target === currentTarget) return result('installed', commandPath);
  if (link.kind === 'missing' || link.target === receipt.target) return result('repair_required', commandPath);
  return result('conflict', commandPath, 'conflict');
}

async function withBookmark<T>(bookmark: string, operation: () => Promise<T>) {
  const stop = app.startAccessingSecurityScopedResource(bookmark);
  try {
    return await operation();
  } finally {
    stop();
  }
}

async function install(window: BrowserWindow | null, receiptPath: string, currentTarget: string) {
  const selection = window
    ? await dialog.showOpenDialog(window, { properties: ['openDirectory'], securityScopedBookmarks: true })
    : await dialog.showOpenDialog({ properties: ['openDirectory'], securityScopedBookmarks: true });
  if (selection.canceled || !selection.filePaths[0] || !selection.bookmarks?.[0]) return result('cancelled');
  const directory = path.resolve(selection.filePaths[0]);
  const commandPath = path.join(directory, 'foliole');
  const link = await readManagedTarget(commandPath);
  if (link.kind === 'conflict' || (link.kind === 'link' && link.target !== currentTarget)) {
    return result('conflict', commandPath, 'conflict');
  }
  return withBookmark(selection.bookmarks[0], async () => {
    if (link.kind === 'missing') await fs.symlink(currentTarget, commandPath);
    await writeReceipt(receiptPath, { bookmark: selection.bookmarks![0]!, directory, target: currentTarget });
    return result('installed', commandPath);
  });
}

async function repairOrRemove(action: 'remove' | 'repair', receiptPath: string,
  receipt: CliReceipt | null, currentTarget: string) {
  if (!receipt) return result('not_installed');
  const commandPath = path.join(receipt.directory, 'foliole');
  return withBookmark(receipt.bookmark, async () => {
    const link = await readManagedTarget(commandPath);
    if (link.kind === 'conflict' || (link.kind === 'link' &&
      link.target !== receipt.target && link.target !== currentTarget)) {
      return result('conflict', commandPath, 'conflict');
    }
    if (link.kind === 'link') await fs.unlink(commandPath);
    if (action === 'remove') {
      await fs.rm(receiptPath, { force: true });
      return result('not_installed');
    }
    await fs.symlink(currentTarget, commandPath);
    await writeReceipt(receiptPath, { ...receipt, target: currentTarget });
    return result('installed', commandPath);
  });
}

export async function runFolioleCliInstallAction(action: CliAction, window: BrowserWindow | null) {
  if (process.platform === 'linux' && app.isPackaged) return inspectLinuxPackageCli();
  if (process.platform !== 'darwin' || process.mas !== true || !app.isPackaged) return result('unavailable');
  const currentTarget = resolvePackagedFolioleCliPath();
  try {
    await fs.access(currentTarget, constants.X_OK);
    const receiptPath = path.join(app.getPath('userData'), RECEIPT_FILE);
    const receipt = await readReceipt(receiptPath);
    if (action === 'status') return inspectFolioleCliInstallation(receipt, currentTarget);
    if (action === 'install') return install(window, receiptPath, currentTarget);
    return repairOrRemove(action, receiptPath, receipt, currentTarget);
  } catch {
    return result('unavailable', null, 'failed');
  }
}
