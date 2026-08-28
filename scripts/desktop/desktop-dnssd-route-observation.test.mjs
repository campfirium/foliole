// @vitest-environment node

import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import {
  loadDesktopRoutePeerIds, waitForDesktopRoute
} from './desktop-dnssd-route-observation.mjs';

it('returns only transient peer Device identities from the Electron main route map', async () => {
  const app = { evaluate: vi.fn(async () => ['device-b']) };
  await expect(loadDesktopRoutePeerIds(app, 'group-a')).resolves.toEqual(['device-b']);
  expect(app.evaluate).toHaveBeenCalledWith(expect.any(Function), 'group-a');
  const source = fs.readFileSync('scripts/desktop/desktop-dnssd-route-observation.mjs', 'utf8');
  expect(source).toContain('peer_device_id: peerDeviceId');
  expect(source).not.toMatch(/endpoint_url|ipv4_addresses|native.*handle|bonjour-service/iu);
});

it('waits for the expected peer without inventing an endpoint fallback', async () => {
  const app = { evaluate: vi.fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(['device-b']) };
  await expect(waitForDesktopRoute(app, 'group-a', 'device-b', {
    wait: vi.fn(async () => undefined)
  })).resolves.toEqual({ peerDeviceId: 'device-b', routePresent: true });
});
