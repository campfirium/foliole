import path from 'node:path';

import type { RestartIntentFileSystem } from './devRestartIntentSupport.js';

export const DEV_RESTART_DELIVERY_FILE = '.windows-dev-restart-delivered.json';
const DEV_RESTART_DELIVERY_KIND = 'foliole.electron.dev.restart-delivered.v1';

interface RestartIntentDeliverySource {
  head: string | null;
  nonce: number;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  target: string;
}

interface RestartIntentDeliveryLogger {
  error(message: string, meta?: unknown): void;
}

function resolveDevRestartDeliveryPath(rootDir: string) {
  return path.join(rootDir, DEV_RESTART_DELIVERY_FILE);
}

function createDevRestartDeliveryPayload(intent: RestartIntentDeliverySource) {
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

export function writeDevRestartDeliveryMarker(args: {
  fileSystem: RestartIntentFileSystem;
  intent: RestartIntentDeliverySource;
  intentPath: string;
  logger: RestartIntentDeliveryLogger;
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
