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

it.each([[0, false], [1, false], [0, true]])('reads live upstream and downstream session availability under the database owner: %s %s', async (upstreams, downstream) => {
  const { loadDesktopSyncRole } = await import('./desktop-dnssd-route-observation.mjs');
  const process = await import('node:process');
  const path = await import('node:path');
  let owned = false;
  const modules = {
    'connection.js': { runWithDatabaseConnectionOwner: async action => {
      owned = true;
      try { return await action(); } finally { owned = false; }
    } },
    'desktopSyncGroupTransport.js': { loadDesktopSyncUpstreamPeers: () => {
      if (!owned) throw new Error('Outside database owner');
      return Array.from({ length: upstreams }, () => ({}));
    } },
    'desktopSyncChangeSessions.js': { desktopSyncChangeSessions: () => ({ hasSessions: () => downstream }) }
  };
  const builtin = process.default.getBuiltinModule.bind(process.default);
  vi.spyOn(process.default, 'getBuiltinModule').mockImplementation(name => name === 'node:module'
    ? { createRequire: () => file => modules[path.basename(file)] } : builtin(name));
  try {
    const app = { evaluate: callback => callback({ app: { getAppPath: () => '/runtime' } }) };
    await expect(loadDesktopSyncRole(app)).resolves.toEqual({ hasUpstream: upstreams > 0, hasDownstream: downstream });
    expect(owned).toBe(false);
  } finally { vi.restoreAllMocks(); }
});

it('defers the native database read until the inspector evaluation stack has returned', async () => {
  const { loadDesktopSyncRole } = await import('./desktop-dnssd-route-observation.mjs');
  const process = await import('node:process');
  const path = await import('node:path');
  let evaluating = true;
  const modules = {
    'connection.js': { runWithDatabaseConnectionOwner: async action => action() },
    'desktopSyncGroupTransport.js': { loadDesktopSyncUpstreamPeers: () => {
      if (evaluating) throw new TypeError('This database connection is busy executing a query');
      return [{}];
    } },
    'desktopSyncChangeSessions.js': { desktopSyncChangeSessions: () => ({ hasSessions: () => false }) }
  };
  const builtin = process.default.getBuiltinModule.bind(process.default);
  vi.spyOn(process.default, 'getBuiltinModule').mockImplementation(name => name === 'node:module'
    ? { createRequire: () => file => modules[path.basename(file)] } : builtin(name));
  try {
    const app = { evaluate: callback => {
      const result = callback({ app: { getAppPath: () => '/runtime' } });
      evaluating = false;
      return result;
    } };
    await expect(loadDesktopSyncRole(app)).resolves.toEqual({ hasUpstream: true, hasDownstream: false });
  } finally { vi.restoreAllMocks(); }
});
