// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  AGENT_CLI_ROUTES,
  AGENT_CONTROL_PRODUCT_CAPABILITIES,
  AGENT_CONTROL_ROUTE_REGISTRY,
  createAgentCliHelp
} from '../../scripts/agent-control/foliole-agent-routes.mjs';

import { capabilityForProtectedPath } from './agentControlRouteCapabilities.js';
import { AGENT_CONTROL_CAPABILITIES } from './agentControlTypes.js';
import { isMaterialWritePath, isVirtualFolderWritePath } from './agentControlWriteNotifications.js';

const EXPECTED_CAPABILITIES = [
  'materials.read', 'materials.search', 'materials.listChildren', 'materials.create',
  'materials.move', 'materials.reorder', 'materials.restore', 'virtualFolders.list',
  'virtualFolders.read', 'virtualFolders.create', 'virtualFolders.addItems',
  'virtualFolders.removeItems', 'virtualFolders.reorder', 'virtualFolders.update',
  'virtualFolders.deleteSoft', 'virtualFolders.restore', 'materials.update',
  'materials.deleteSoft'
];

describe('Agent Control contract registry', () => {
  it('is the source of product capabilities and protected route mapping', () => {
    expect(AGENT_CONTROL_PRODUCT_CAPABILITIES).toEqual(EXPECTED_CAPABILITIES);
    expect(AGENT_CONTROL_CAPABILITIES).toEqual(EXPECTED_CAPABILITIES);

    for (const entry of AGENT_CONTROL_ROUTE_REGISTRY) {
      expect(capabilityForProtectedPath(entry.apiMethod, entry.apiPath)).toBe(entry.capability);
      const optionsCapability = capabilityForProtectedPath('OPTIONS', entry.apiPath);
      expect(optionsCapability).toBe(entry.access === 'product' ? entry.capability : null);
    }
  });

  it('keeps foundation auth API-only while projecting stable CLI help', () => {
    const authVerify = AGENT_CONTROL_ROUTE_REGISTRY.find((entry) =>
      entry.apiPath === '/agent-control/v1/auth/verify'
    );
    expect(authVerify).toMatchObject({
      access: 'foundation', capability: 'foundation.auth.verify', cli: null
    });

    const names = createAgentCliHelp().commands.map((command) => command.name);
    expect(names).toEqual(Object.keys(AGENT_CLI_ROUTES));
    expect(names).not.toContain('auth/verify');
  });

  it('derives material and virtual Folder write classification', () => {
    for (const entry of AGENT_CONTROL_ROUTE_REGISTRY) {
      expect(isMaterialWritePath(entry.apiPath)).toBe(entry.writeKind === 'material');
      expect(isVirtualFolderWritePath(entry.apiPath)).toBe(entry.writeKind === 'virtual_folder');
    }
  });
});
