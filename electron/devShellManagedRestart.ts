import { writeDevRestartDeliveryMarker } from './devRestartDelivery.js';
import type { RestartIntentFileSystem } from './devRestartIntentSupport.js';
import {
  prepareWindowsForDevRestart,
  type RestartIntentApp,
  type RestartIntentWindow
} from './devRestartRelaunch.js';
import { createDevRestartBootSession } from './devRestartSession.js';
import { requestDevShellRestart } from './devShellRestartRequest.js';

interface ShellManagedRestartIntent {
  head: string | null;
  nonce: number;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  shellAction: 'exit-shell' | 'restart-runtime';
  target: string;
}

interface ShellManagedRestartLogger {
  error(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
}

export async function requestShellManagedDevRestart(args: {
  app: RestartIntentApp;
  fileSystem: RestartIntentFileSystem;
  getWindows: () => RestartIntentWindow[];
  intent: ShellManagedRestartIntent;
  intentPath: string;
  logger: ShellManagedRestartLogger;
}) {
  const bootSession = createDevRestartBootSession(args.intent);
  if (!requestDevShellRestart({
    bootSession,
    reason: args.intent.reason,
    runtimeHead: args.intent.head,
    shellAction: args.intent.shellAction
  })) {
    args.logger.error('[electron-main] failed to request shell-managed dev restart', {
      intentPath: args.intentPath,
      nonce: args.intent.nonce
    });
    return;
  }
  writeDevRestartDeliveryMarker({
    fileSystem: args.fileSystem,
    intent: args.intent,
    intentPath: args.intentPath,
    logger: args.logger
  });
  await prepareWindowsForDevRestart(args.getWindows());
  args.app.exit(0);
}
