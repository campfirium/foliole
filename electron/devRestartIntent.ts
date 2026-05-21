import path from 'node:path';

import { writeDevRestartDeliveryMarker } from './devRestartDelivery.js';
import {
  createNodeFileSystem,
  isMissingFileError,
  type RestartIntentFileSystem
} from './devRestartIntentSupport.js';
import {
  relaunchForDevRestartIntent,
  type RestartIntentApp,
  type RestartIntentWindow
} from './devRestartRelaunch.js';

export const DEV_RESTART_INTENT_FILE = '.windows-dev-restart-intent.json';
export const DEV_RESTART_INTENT_KIND = 'foliole.electron.dev.restart-intent.v1';
export {
  DEV_RESTART_DELIVERY_FILE,
  DEV_RESTART_DELIVERY_KIND,
  resolveDevRestartDeliveryPath
} from './devRestartDelivery.js';

interface RestartIntent {
  head: string | null;
  kind: string;
  nonce: number;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  target: string;
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

export function isInAppRelaunchDisabled(env: NodeJS.ProcessEnv = process.env) {
  return env.FOLIOLE_DISABLE_IN_APP_RELAUNCH === '1';
}

export function resolveDevRestartIntentPath(rootDir: string) {
  return path.join(rootDir, DEV_RESTART_INTENT_FILE);
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

async function consumeDevRestartIntent(args: {
  app: RestartIntentApp;
  content: string;
  consumedNonce: number;
  fileSystem: RestartIntentFileSystem;
  getWindows: () => RestartIntentWindow[];
  intentPath: string;
  logger: RestartIntentLogger;
  relaunchDisabled: boolean;
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
  if (args.relaunchDisabled) {
    args.logger.info('[electron-main] ignored dev restart intent because relaunch is shell-managed', {
      intentPath: args.intentPath,
      nonce: intent.nonce
    });
    return { consumedNonce: intent.nonce, relaunchRequested: false };
  }
  writeDevRestartDeliveryMarker({ fileSystem: args.fileSystem, intent, intentPath: args.intentPath, logger: args.logger });
  await relaunchForDevRestartIntent({
    app: args.app,
    getWindows: args.getWindows,
    intent
  });
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
      relaunchDisabled: isInAppRelaunchDisabled(env),
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
