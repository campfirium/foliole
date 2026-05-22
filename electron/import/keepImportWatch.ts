import fs from 'node:fs';

export interface KeepImportWatchHandle {
  close(): void;
}

export class KeepImportWatchMissingDirectoryError extends Error {
  constructor(readonly directoryPath: string) {
    super(`Keep import source directory does not exist: ${directoryPath}`);
    this.name = 'KeepImportWatchMissingDirectoryError';
  }
}

export function isKeepImportWatchMissingDirectoryError(error: unknown): error is KeepImportWatchMissingDirectoryError {
  return error instanceof KeepImportWatchMissingDirectoryError;
}

function isMissingDirectoryError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

export function watchKeepImportDirectory(rootPath: string, listener: () => void): KeepImportWatchHandle {
  try {
    const watcher = fs.watch(rootPath, { recursive: true }, listener);
    return {
      close() {
        watcher.close();
      }
    };
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      throw new KeepImportWatchMissingDirectoryError(rootPath);
    }
    try {
      const watcher = fs.watch(rootPath, listener);
      return {
        close() {
          watcher.close();
        }
      };
    } catch (fallbackError) {
      if (isMissingDirectoryError(fallbackError)) {
        throw new KeepImportWatchMissingDirectoryError(rootPath);
      }
      throw fallbackError;
    }
  }
}
