import type { AgentControlCapability, AgentControlCapabilityStatus } from './agentControlTypes.js';

export function isCapabilityEnabled(name: AgentControlCapability): AgentControlCapabilityStatus['enabled'] {
  return name === 'materials.read' ||
    name === 'materials.search' ||
    name === 'materials.update' ||
    name === 'materials.deleteSoft' ||
    name === 'virtualFolders.list' ||
    name === 'virtualFolders.read' ||
    name === 'virtualFolders.create' ||
    name === 'virtualFolders.addItems' ||
    name === 'virtualFolders.removeItems' ||
    name === 'virtualFolders.reorder';
}