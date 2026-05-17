import fs from 'node:fs';

export interface KeepImportWatchHandle {
  close(): void;
}

export function watchKeepImportDirectory(rootPath: string, listener: () => void): KeepImportWatchHandle {
  try {
    const watcher = fs.watch(rootPath, { recursive: true }, listener);
    return {
      close() {
        watcher.close();
      }
    };
  } catch {
    const watcher = fs.watch(rootPath, listener);
    return {
      close() {
        watcher.close();
      }
    };
  }
}
