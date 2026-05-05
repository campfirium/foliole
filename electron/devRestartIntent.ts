import path from 'node:path';

import {
  createNodeFileSystem,
  isMissingFileError,
  type RestartIntentFileSystem
} from './devRestartIntentSupport.js';
import { saveWindowStateNow } from './ipc/windowState.js';
import { allowWindowCloseWithoutReadingProgressFlush, flushReadingProgressForWindows } from './readingProgressWindowFlush.js';

export const DEV_RESTART_INTENT_FILE = '.windows-dev-restart-intent.json';
export const DEV_RESTART_INTENT_KIND = 'foliole.electron.dev.restart-intent.v1';
export const DEV_RESTART_DELIVERY_FILE = '.windows-dev-restart-delivered.json';
export const DEV_RESTART_DELIVERY_KIND = 'foliole.electron.dev.restart-delivered.v1';

interface RestartIntent {
  head: string | null;
  kind: string;
  nonce: number;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  target: string;
}

interface RestartIntentApp {
  exit(code?: number): void;
  relaunch(): void;
}

interface RestartIntentWindow {
  isDestroyed?(): boolean;
  webContents?: {
    executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
    isDestroyed(): boolean;
  };
}

interface RestartIntentLogger {
  error(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
}

export interface DevRestartIntentWatcher {
  checkNow(): void;
  close(): void;
  intentPath: string;
}

export function isDevRestartIntentEnabled(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.ELECTRON_RENDERER_URL);
}

export function resolveDevRestartIntentPath(rootDir: string) {
  return path.join(rootDir, DEV_RESTART_INTENT_FILE);
}

export function resolveDevRestartDeliveryPath(rootDir: string) {
  return path.join(rootDir, DEV_RESTART_DELIVERY_FILE);
}

export function parseDevRestartIntent(content: string): RestartIntent | null {
  try {
    const parsed = JSON.parse(content) as Partial<RestartIntent>;
    const nonce = Number(parsed.nonce);
    if (parsed.kind !== DEV_RESTART_INTENT_KIND || parsed.target !== 'electron-dev') {
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

function readDevRestartIntent(fileSystem: RestartIntentFileSystem, intentPath: string, logger: RestartIntentLogger) {
  try {
    return fileSystem.readIntentFile(intentPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    logger.error('[electron-main] failed to read dev restart intent', { error, intentPath });
    return null;
  }
}

function writeDevRestartDeliveryMarker(args: {
  fileSystem: RestartIntentFileSystem;
  intent: RestartIntent;
  intentPath: string;
  logger: RestartIntentLogger;
}) {
  try {
    args.fileSystem.writeDeliveryFile(
      resolveDevRestartDeliveryPath(path.dirname(args.intentPath)),
      `${JSON.stringify(createDevRestartDeliveryPayload(args.intent), null, 2)}\n`
    );
  } catch (error) {
    args.logger.error('[electron-main] failed to write dev restart delivery marker', {
      error,
      intentPath: args.intentPath,
      nonce: args.intent.nonce
    });
  }
}

function createDevRestartDeliveryPayload(intent: RestartIntent) {
  return {
    deliveredAt: new Date().toISOString(),
    head: intent.head,
    kind: DEV_RESTART_DELIVERY_KIND,
    nonce: intent.nonce,
    reason: intent.reason,
    requestedAt: intent.requestedAt,
    requestedBy: intent.requestedBy,
    target: intent.target
  };
}

function applyRuntimeHeadForRelaunch(intent: RestartIntent) {
  const nextHead = typeof intent.head === 'string' ? intent.head.trim() : '';
  if (nextHead.length === 0) {
    return;
  }
  process.env.FOLIOLE_RUNTIME_HEAD = nextHead;
}

async function consumeDevRestartIntent(args: {
  app: RestartIntentApp;
  content: string;
  consumedNonce: number;
  fileSystem: RestartIntentFileSystem;
  getWindows: () => RestartIntentWindow[];
  intentPath: string;
  logger: RestartIntentLogger;
  relaunchRequested: boolean;
}) {
  if (args.relaunchRequested) {
    return { consumedNonce: args.consumedNonce, relaunchRequested: true };
  }

  const intent = parseDevRestartIntent(args.content);
  if (!intent || intent.nonce <= args.consumedNonce) {
    return { consumedNonce: args.consumedNonce, relaunchRequested: false };
  }

  try {
    args.fileSystem.deleteIntentFile(args.intentPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return { consumedNonce: args.consumedNonce, relaunchRequested: false };
    }
    args.logger.error('[electron-main] failed to consume dev restart intent', {
      error,
      intentPath: args.intentPath,
      nonce: intent.nonce
    });
    return { consumedNonce: args.consumedNonce, relaunchRequested: false };
  }

  args.logger.info('[electron-main] consumed dev restart intent', {
    head: intent.head,
    intentPath: args.intentPath,
    nonce: intent.nonce,
    reason: intent.reason,
    requestedAt: intent.requestedAt,
    requestedBy: intent.requestedBy
  });
  writeDevRestartDeliveryMarker({ fileSystem: args.fileSystem, intent, intentPath: args.intentPath, logger: args.logger });
  applyRuntimeHeadForRelaunch(intent);
  const windows = args.getWindows();
  await flushReadingProgressForWindows(windows as never[]);
  for (const window of windows) {
    if (window.isDestroyed?.()) {
      continue;
    }
    allowWindowCloseWithoutReadingProgressFlush(window as never);
    saveWindowStateNow(window as never);
  }
  args.app.relaunch();
  args.app.exit(0);
  return { consumedNonce: intent.nonce, relaunchRequested: true };
}

export function installDevRestartIntentWatcher(options: {
  app: RestartIntentApp;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fileSystem?: RestartIntentFileSystem;
  getWindows?: () => RestartIntentWindow[];
  logger?: RestartIntentLogger;
}): DevRestartIntentWatcher | null {
  const env = options.env ?? process.env;
  if (!isDevRestartIntentEnabled(env)) {
    return null;
  }

  const rootDir = (env.FOLIOLE_RESTART_INTENT_ROOT ?? options.cwd ?? process.cwd()).trim();
  const intentPath = resolveDevRestartIntentPath(rootDir);
  const fileSystem = options.fileSystem ?? createNodeFileSystem();
  const logger = options.logger ?? console;
  let consumedNonce = 0;
  let restartInFlight = false;
  let relaunchRequested = false;

  const checkNow = () => {
    if (restartInFlight) {
      return;
    }
    const content = readDevRestartIntent(fileSystem, intentPath, logger);
    if (content === null) {
      return;
    }
    restartInFlight = true;
    void consumeDevRestartIntent({
      app: options.app,
      content,
      consumedNonce,
      fileSystem,
      getWindows: options.getWindows ?? (() => []),
      intentPath,
      logger,
      relaunchRequested
    }).then((next) => {
      consumedNonce = next.consumedNonce;
      relaunchRequested = next.relaunchRequested;
      restartInFlight = false;
    }).catch(() => {
      restartInFlight = false;
    });
  };

  fileSystem.watchIntentFile(intentPath, checkNow);
  const pollInterval = setInterval(checkNow, 1000);
  logger.info('[electron-main] watching dev restart intent', { intentPath, rootDir });
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
