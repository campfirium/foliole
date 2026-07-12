// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runMacPreview } from './android-preview.mjs';

describe('macOS Android preview', () => {
  it('orders sync, protected backup, deploy, and protected check', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-mac-preview-'));
    const calls = [];
    try {
      const code = await runMacPreview(root, async () => { calls.push('sync'); return 0; }, {}, {
        resolveDevice: async () => ({ adb: '/sdk/adb', serial: 'A5' }),
        protectData: async (mode) => { calls.push(mode); return 0; },
        deploy: async (_repo, env) => { calls.push(`deploy:${env.FOLIOLE_ANDROID_SERIAL}`); return 0; }
      });
      expect(code).toBe(0);
      expect(calls).toEqual(['sync', 'backup', 'deploy:A5', 'check']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('short-circuits before device and deploy when sync fails', async () => {
    const resolveDevice = vi.fn();
    const deploy = vi.fn();
    const code = await runMacPreview('/repo', async () => 42, {}, { resolveDevice, deploy });
    expect(code).toBe(1);
    expect(resolveDevice).not.toHaveBeenCalled();
    expect(deploy).not.toHaveBeenCalled();
  });
});
