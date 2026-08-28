// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import { runWindowsDesktopDnsSdRouteSelfcheckAction } from
  './windows-desktop-dnssd-route-selfcheck-action.mjs';

it('launches the real product from the prepared fixed runtime for the positive selfcheck', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'route-product-launch-'));
  const app = { process: () => ({ pid: 42 }) };
  const closeSession = vi.fn(async () => undefined);
  const launcher = { launch: vi.fn() };
  const openSession = vi.fn(async () => ({ app }));
  const result = await runWindowsDesktopDnsSdRouteSelfcheckAction({
    buildIdentity: 'build-1', evidenceRoot, paths: { repoRoot: 'D:\\C\\foliole' },
    selfcheckMode: 'product-launch'
  }, { closeSession, openSession, resolveLauncher: vi.fn(() => launcher) });
  expect(openSession).toHaveBeenCalledWith({ repoRoot: 'D:\\C\\foliole' },
    evidenceRoot, launcher);
  expect(closeSession).toHaveBeenCalledWith({ app });
  expect(result.desktopDnsSdRouteSelfcheck.manifestPath).toContain(ACTION_RECEIPT);
  expect(JSON.parse(fs.readFileSync(path.join(evidenceRoot,
    'selfcheck-product-launch.json'), 'utf8'))).toMatchObject({ processId: 42,
    resultStatus: 'success' });
});

const ACTION_RECEIPT = 'desktop-dnssd-route-selfcheck-receipt.json';
