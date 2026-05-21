import { randomUUID } from 'node:crypto';

interface RestartIntentSessionSource {
  nonce: number;
}

export function createDevRestartBootSession(intent: RestartIntentSessionSource) {
  return `windows-native-relaunch-${intent.nonce}-${randomUUID()}`;
}

export function applyBootSessionForRelaunch(intent: RestartIntentSessionSource, env: NodeJS.ProcessEnv = process.env) {
  const nextSession = createDevRestartBootSession(intent);
  env.FOLIOLE_BOOT_SESSION = nextSession;
  return nextSession;
}

export function createRelaunchArgs(nextSession: string, argv: string[] = process.argv) {
  const sessionArg = `--foliole-boot-session=${nextSession}`;
  return [...argv.slice(1).filter((arg) => !arg.startsWith('--foliole-boot-session=')), sessionArg];
}
