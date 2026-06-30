import { promises as fs } from 'node:fs';
import path from 'node:path';

const MOVE_RETRY_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);
const MOVE_RETRY_DELAYS_MS = [50, 100, 200, 400];
const VOLATILE_SQLITE_SUFFIXES = ['-wal', '-shm'];

export async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function readErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : null;
}

function isVolatileSqliteSidecar(filePath: string) {
  return VOLATILE_SQLITE_SUFFIXES.some((suffix) => path.basename(filePath).endsWith(suffix));
}

async function assertMovableSourceExists(sourcePath: string) {
  if (await pathExists(sourcePath)) {
    return true;
  }
  if (isVolatileSqliteSidecar(sourcePath)) {
    return false;
  }
  await fs.access(sourcePath);
  return true;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithBusyRetry(sourcePath: string, targetPath: string, onBusyRetry?: () => void) {
  for (const retryDelay of [0, ...MOVE_RETRY_DELAYS_MS]) {
    if (retryDelay > 0) {
      await delay(retryDelay);
    }
    try {
      await fs.rename(sourcePath, targetPath);
      return;
    } catch (error) {
      if (!MOVE_RETRY_CODES.has(String(readErrorCode(error))) || retryDelay === MOVE_RETRY_DELAYS_MS.at(-1)) {
        throw error;
      }
      onBusyRetry?.();
    }
  }
}

async function unlinkWithBusyRetry(targetPath: string, onBusyRetry?: () => void) {
  for (const retryDelay of [0, ...MOVE_RETRY_DELAYS_MS]) {
    if (retryDelay > 0) {
      await delay(retryDelay);
    }
    try {
      await fs.unlink(targetPath);
      return;
    } catch (error) {
      if (!MOVE_RETRY_CODES.has(String(readErrorCode(error))) || retryDelay === MOVE_RETRY_DELAYS_MS.at(-1)) {
        throw error;
      }
      onBusyRetry?.();
    }
  }
}

async function moveFile(sourcePath: string, targetPath: string, onBusyRetry?: () => void) {
  if (sourcePath === targetPath || !(await assertMovableSourceExists(sourcePath))) {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (!(await pathExists(targetPath))) {
    try {
      await renameWithBusyRetry(sourcePath, targetPath, onBusyRetry);
      return;
    } catch (error) {
      if (readErrorCode(error) === 'ENOENT' && isVolatileSqliteSidecar(sourcePath) && !(await pathExists(sourcePath))) {
        return;
      }
      if (!isRecoverableMoveError(error)) {
        throw error;
      }
    }
  }

  if (await pathExists(targetPath)) {
    const [sourceBytes, targetBytes] = await Promise.all([fs.readFile(sourcePath), fs.readFile(targetPath)]);
    if (!sourceBytes.equals(targetBytes)) {
      throw new Error(`library path move conflict: ${targetPath}`);
    }
    await unlinkWithBusyRetry(sourcePath, onBusyRetry);
    return;
  }

  await fs.copyFile(sourcePath, targetPath);
  await unlinkWithBusyRetry(sourcePath, onBusyRetry);
}

function isRecoverableMoveError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : null;
  return code === 'EXDEV' || code === 'EEXIST' || code === 'ENOTEMPTY' || MOVE_RETRY_CODES.has(String(code));
}

export async function moveDirectoryContents(sourcePath: string, targetPath: string, onBusyRetry?: () => void) {
  if (sourcePath === targetPath) {
    return;
  }

  if (!(await pathExists(sourcePath))) {
    await fs.mkdir(targetPath, { recursive: true });
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (!(await pathExists(targetPath))) {
    try {
      await renameWithBusyRetry(sourcePath, targetPath, onBusyRetry);
      return;
    } catch (error) {
      if (!isRecoverableMoveError(error)) {
        throw error;
      }
    }
  }

  await fs.mkdir(targetPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const currentSourcePath = path.join(sourcePath, entry.name);
    const currentTargetPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await moveDirectoryContents(currentSourcePath, currentTargetPath, onBusyRetry);
      continue;
    }
    await moveFile(currentSourcePath, currentTargetPath, onBusyRetry);
  }
  await fs.rm(sourcePath, { recursive: true, force: true });
}
