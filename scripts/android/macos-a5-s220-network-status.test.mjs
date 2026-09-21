import { expect, it, vi } from 'vitest';

import { assertS220A5NetworkRestored,
  confirmS220A5NetworkRestored } from './macos-a5-s220-network-status.mjs';

const healthy = { airplane: { code: 0, output: '0' }, wifi: { code: 0, output: '1' },
  mobileData: { code: 0, output: '0' }, activeNetwork: { code: 0,
    lines: ['Active default network: 4875', 'NetworkAgentInfo WIFI CONNECTED VALIDATED'] } };

it('requires a validated active Wi-Fi default network, not just radio settings', () => {
  expect(() => assertS220A5NetworkRestored(healthy)).not.toThrow();
  expect(() => assertS220A5NetworkRestored({ ...healthy, activeNetwork: {
    code: 0, lines: ['Active default network: none']
  } })).toThrow(/independently restored/);
  expect(() => assertS220A5NetworkRestored({ ...healthy,
    mobileData: { code: 0, output: '1' } })).toThrow(/independently restored/);
});

it('rejects a failed restore or fallback before claiming network recovery', async () => {
  const execute = vi.fn();
  for (const receipt of [{ networkRestored: '{"restored":false}' },
    { networkRestored: '{"restored":true}', restoreError: 'runner missing' }]) {
    await expect(confirmS220A5NetworkRestored({ receipt, execute }))
      .rejects.toThrow(/fallback is not proof/);
  }
  expect(execute).not.toHaveBeenCalled();
});
