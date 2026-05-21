import { describe, expect, it } from 'vitest';

import {
  applyBootSessionForRelaunch,
  createDevRestartBootSession,
  createRelaunchArgs
} from './devRestartSession.js';

describe('dev restart relaunch session', () => {
  it('creates a fresh native restart boot session from the delivered intent', () => {
    expect(createDevRestartBootSession({ nonce: 7 })).toMatch(/^windows-native-relaunch-7-/);
  });

  it('stores the fresh session in the relaunch environment', () => {
    const env: NodeJS.ProcessEnv = {};

    const session = applyBootSessionForRelaunch({ nonce: 8 }, env);

    expect(env.FOLIOLE_BOOT_SESSION).toBe(session);
    expect(session).toMatch(/^windows-native-relaunch-8-/);
  });

  it('replaces stale boot session args with the fresh relaunch session arg', () => {
    expect(createRelaunchArgs('fresh-session', [
      'electron.exe',
      '--foliole-boot-session=stale-session',
      '--inspect=0'
    ])).toEqual(['--inspect=0', '--foliole-boot-session=fresh-session']);
  });
});
