export const VIRTUAL_NODE_APP_COMMAND_ID = 'workspace.createVirtualNode';

export interface VirtualNodeCommandDefinition {
  appCommandId: typeof VIRTUAL_NODE_APP_COMMAND_ID;
  listLabel: string;
  menuLabel: string;
  paletteTitle: string;
}

export const VIRTUAL_NODE_COMMAND: VirtualNodeCommandDefinition = {
  appCommandId: VIRTUAL_NODE_APP_COMMAND_ID,
  listLabel: 'Create Virtual Node',
  menuLabel: 'Create Virtual Node',
  paletteTitle: 'Create Virtual Node'
};
