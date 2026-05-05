import fs from 'node:fs';

export interface RestartIntentFileSystem {
  deleteIntentFile(filePath: string): void;
  readIntentFile(filePath: string): string;
  unwatchIntentFile(filePath: string, listener: () => void): void;
  watchIntentFile(filePath: string, listener: () => void): void;
  writeDeliveryFile(filePath: string, content: string): void;
}

export function createNodeFileSystem(): RestartIntentFileSystem {
  return {
    deleteIntentFile(filePath) {
      fs.unlinkSync(filePath);
    },
    readIntentFile(filePath) {
      return fs.readFileSync(filePath, 'utf8');
    },
    unwatchIntentFile(filePath, listener) {
      fs.unwatchFile(filePath, listener);
    },
    watchIntentFile(filePath, listener) {
      fs.watchFile(filePath, { interval: 250 }, listener);
    },
    writeDeliveryFile(filePath, content) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  };
}

export function isMissingFileError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
