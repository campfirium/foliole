import fs from 'node:fs';
import path from 'node:path';

export const DEV_RENDERER_RELOAD_INTENT_FILE = '.windows-dev-renderer-reload-intent.json';
export const DEV_RENDERER_RELOAD_INTENT_KIND = 'foliole.electron.dev.renderer-reload-intent.v1';
export const DEV_RENDERER_RELOAD_DELIVERY_FILE = '.windows-dev-renderer-reload-delivered.json';
export const DEV_RENDERER_RELOAD_DELIVERY_KIND = 'foliole.electron.dev.renderer-reload-delivered.v1';

interface RendererReloadIntent {
  head: string | null;
  kind: string;
  nonce: number;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  target: string;
}

interface RendererReloadWindow {
  isDestroyed(): boolean;
  webContents: {
    reloadIgnoringCache(): void;
  };
}

interface RendererReloadFileSystem {
  deleteIntentFile(filePath: string): void;
  readIntentFile(filePath: string): string;
  unwatchIntentFile(filePath: string, listener: () => void): void;
  watchIntentFile(filePath: string, listener: () => void): void;
  writeDeliveryFile(filePath: string, content: string): void;
}

interface RendererReloadLogger {
  error(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
}

export interface DevRendererReloadIntentWatcher {
  checkNow(): void;
  close(): void;
  intentPath: string;
}

function createNodeFileSystem(): RendererReloadFileSystem {
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

function isMissingFileError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

export function isDevRendererReloadIntentEnabled(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.ELECTRON_RENDERER_URL);
}

export function resolveDevRendererReloadIntentPath(rootDir: string) {
  return path.join(rootDir, DEV_RENDERER_RELOAD_INTENT_FILE);
}

export function resolveDevRendererReloadDeliveryPath(rootDir: string) {
  return path.join(rootDir, DEV_RENDERER_RELOAD_DELIVERY_FILE);
}

export function parseDevRendererReloadIntent(content: string): RendererReloadIntent | null {
  try {
    const parsed = JSON.parse(content) as Partial<RendererReloadIntent>;
    const nonce = Number(parsed.nonce);
    if (parsed.kind !== DEV_RENDERER_RELOAD_INTENT_KIND || parsed.target !== 'electron-dev-renderer') {
      return null;
    }
    if (!Number.isSafeInteger(nonce) || nonce <= 0) {
      return null;
    }
    if (typeof parsed.reason !== 'string' || parsed.reason.trim().length === 0) {
      return null;
    }
    if (typeof parsed.requestedAt !== 'string' || parsed.requestedAt.trim().length === 0) {
      return null;
    }
    if (typeof parsed.requestedBy !== 'string' || parsed.requestedBy.trim().length === 0) {
      return null;
    }
    return {
      head: typeof parsed.head === 'string' ? parsed.head : null,
      kind: parsed.kind,
      nonce,
      reason: parsed.reason,
      requestedAt: parsed.requestedAt,
      requestedBy: parsed.requestedBy,
      target: parsed.target
    };
  } catch {
    return null;
  }
}

function readDevRendererReloadIntent(
  fileSystem: RendererReloadFileSystem,
  intentPath: string,
  logger: RendererReloadLogger
) {
  try {
    return fileSystem.readIntentFile(intentPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    logger.error('[electron-main] failed to read dev renderer reload intent', { error, intentPath });
    return null;
  }
}

function writeDevRendererReloadDeliveryMarker(args: {
  fileSystem: RendererReloadFileSystem;
  intent: RendererReloadIntent;
  intentPath: string;
  logger: RendererReloadLogger;
}) {
  try {
    args.fileSystem.writeDeliveryFile(
      resolveDevRendererReloadDeliveryPath(path.dirname(args.intentPath)),
      `${JSON.stringify(
        {
          deliveredAt: new Date().toISOString(),
          head: args.intent.head,
          kind: DEV_RENDERER_RELOAD_DELIVERY_KIND,
          nonce: args.intent.nonce,
          reason: args.intent.reason,
          requestedAt: args.intent.requestedAt,
          requestedBy: args.intent.requestedBy,
          target: args.intent.target
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    args.logger.error('[electron-main] failed to write dev renderer reload delivery marker', {
      error,
      intentPath: args.intentPath,
      nonce: args.intent.nonce
    });
  }
}

function consumeDevRendererReloadIntent(args: {
  consumedNonce: number;
  content: string;
  fileSystem: RendererReloadFileSystem;
  getWindows: () => RendererReloadWindow[];
  intentPath: string;
  logger: RendererReloadLogger;
}) {
  const intent = parseDevRendererReloadIntent(args.content);
  if (!intent || intent.nonce <= args.consumedNonce) {
    return args.consumedNonce;
  }

  const windows = args.getWindows().filter((window) => !window.isDestroyed());
  if (windows.length === 0) {
    return args.consumedNonce;
  }

  try {
    args.fileSystem.deleteIntentFile(args.intentPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return args.consumedNonce;
    }
    args.logger.error('[electron-main] failed to consume dev renderer reload intent', {
      error,
      intentPath: args.intentPath,
      nonce: intent.nonce
    });
    return args.consumedNonce;
  }

  writeDevRendererReloadDeliveryMarker({
    fileSystem: args.fileSystem,
    intent,
    intentPath: args.intentPath,
    logger: args.logger
  });

  for (const window of windows) {
    window.webContents.reloadIgnoringCache();
  }
  args.logger.info('[electron-main] consumed dev renderer reload intent', {
    head: intent.head,
    intentPath: args.intentPath,
    nonce: intent.nonce,
    reason: intent.reason,
    requestedAt: intent.requestedAt,
    requestedBy: intent.requestedBy,
    windowCount: windows.length
  });
  return intent.nonce;
}

export function installDevRendererReloadIntentWatcher(options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fileSystem?: RendererReloadFileSystem;
  getWindows: () => RendererReloadWindow[];
  logger?: RendererReloadLogger;
}): DevRendererReloadIntentWatcher | null {
  const env = options.env ?? process.env;
  if (!isDevRendererReloadIntentEnabled(env)) {
    return null;
  }

  const rootDir = (env.FOLIOLE_RESTART_INTENT_ROOT ?? options.cwd ?? process.cwd()).trim();
  const intentPath = resolveDevRendererReloadIntentPath(rootDir);
  const fileSystem = options.fileSystem ?? createNodeFileSystem();
  const logger = options.logger ?? console;
  let consumedNonce = 0;

  const checkNow = () => {
    const content = readDevRendererReloadIntent(fileSystem, intentPath, logger);
    if (content === null) {
      return;
    }
    consumedNonce = consumeDevRendererReloadIntent({
      consumedNonce,
      content,
      fileSystem,
      getWindows: options.getWindows,
      intentPath,
      logger
    });
  };

  fileSystem.watchIntentFile(intentPath, checkNow);
  const pollInterval = setInterval(checkNow, 1000);
  logger.info('[electron-main] watching dev renderer reload intent', { intentPath, rootDir });
  checkNow();

  return {
    checkNow,
    close() {
      clearInterval(pollInterval);
      fileSystem.unwatchIntentFile(intentPath, checkNow);
    },
    intentPath
  };
}
