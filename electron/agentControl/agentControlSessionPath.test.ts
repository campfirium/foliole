import { expect, it, vi } from 'vitest';

import { AGENT_CONTROL_APP_GROUP, resolveMasAgentControlSessionPath } from './agentControlSessionPath.js';

it('uses the native App Group container for a MAS session descriptor', () => {
  const appGroupContainerPath = vi.fn(() => ({ ok: true as const, path: '/group/agent-control' }));
  const result = resolveMasAgentControlSessionPath({
    loadAdapter: () => ({ adapter: { appGroupContainerPath }, status: 'ready' }),
    mas: true,
    platform: 'darwin'
  });

  expect(appGroupContainerPath).toHaveBeenCalledWith(AGENT_CONTROL_APP_GROUP);
  expect(result).toBe('/group/agent-control/agent-control-session.json');
});

it('keeps non-MAS runtimes on their existing session path', () => {
  expect(resolveMasAgentControlSessionPath({ mas: false, platform: 'darwin' })).toBeNull();
  expect(resolveMasAgentControlSessionPath({ mas: true, platform: 'win32' })).toBeNull();
});

it('fails closed when the MAS App Group container is unavailable', () => {
  expect(() => resolveMasAgentControlSessionPath({
    loadAdapter: () => ({ message: 'missing addon', status: 'module_unavailable' }),
    mas: true,
    platform: 'darwin'
  })).toThrow('agent_control_app_group_unavailable');
});
