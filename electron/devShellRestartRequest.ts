import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface DevShellRestartRequestArgs {
  now?: () => Date;
  requestFile?: string;
  reason: string;
}

function resolveRequestFile(explicitPath?: string) {
  return explicitPath ?? process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE ?? '';
}

export function requestDevShellRestart(args: DevShellRestartRequestArgs) {
  const requestFile = resolveRequestFile(args.requestFile);
  if (!requestFile) {
    return false;
  }
  const requestedAt = (args.now?.() ?? new Date()).toISOString();
  fs.mkdirSync(path.dirname(requestFile), { recursive: true });
  fs.writeFileSync(
    requestFile,
    `${JSON.stringify(
      {
        id: randomUUID(),
        kind: 'foliole-dev-shell-restart',
        reason: args.reason,
        requestedAt
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return true;
}
