// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { restartBridgeResultTimeoutMs } from './ios-acceptance-restart-runner.mjs';

describe('iOS acceptance restart runner', () => {
  it('waits longer for sync-pack runtime restart bridge results', () => {
    expect(restartBridgeResultTimeoutMs('sync-pack-runtime')).toBe(60_000);
    expect(restartBridgeResultTimeoutMs('pairing-signed-transport')).toBe(15_000);
  });
});
