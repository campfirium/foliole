import { isCapabilityEnabled } from './agentControlCapabilities.js';
import { AGENT_CONTROL_CAPABILITIES, type AgentControlCapability } from './agentControlTypes.js';

export function capabilityForProtectedPath(method: string | undefined, pathname: string): string | null {
  if (method === 'GET' && pathname === '/agent-control/v1/capabilities') return 'foundation.capabilities';
  if (method === 'POST' && pathname === '/agent-control/v1/auth/verify') return 'foundation.auth.verify';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/read') return 'materials.read';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/search') return 'materials.search';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/list-children') return 'materials.listChildren';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/update') return 'materials.update';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/delete-soft') return 'materials.deleteSoft';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/list') return 'virtualFolders.list';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/read') return 'virtualFolders.read';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/create') return 'virtualFolders.create';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/add-items') return 'virtualFolders.addItems';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/remove-items') return 'virtualFolders.removeItems';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/reorder') return 'virtualFolders.reorder';
  return null;
}

export function isProtectedRouteCapabilityDisabled(
  capability: string | null,
  isEnabled: (capability: AgentControlCapability) => boolean = isCapabilityEnabled
) {
  return isRouteCapability(capability) && !isEnabled(capability);
}

function isRouteCapability(capability: string | null): capability is AgentControlCapability {
  return Boolean(capability && (AGENT_CONTROL_CAPABILITIES as readonly string[]).includes(capability));
}
