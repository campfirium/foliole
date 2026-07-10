import type http from 'node:http';

import {
  handleMaterialDeleteSoft,
  handleMaterialRead,
  handleMaterialSearch,
  handleMaterialUpdate
} from './agentControlMaterialHandlers.js';
import { handleMaterialListChildren } from './agentControlMaterialListHandlers.js';
import {
  handleMaterialCreate,
  handleMaterialMove,
  handleMaterialReorder,
  handleMaterialRestore
} from './agentControlMaterialStructureHandlers.js';
import type { AgentControlRequestHandlerOptions } from './agentControlRequestHandler.js';
import {
  handleVirtualFolderAddItems,
  handleVirtualFolderCreate,
  handleVirtualFolderList,
  handleVirtualFolderRead,
  handleVirtualFolderRemoveItems,
  handleVirtualFolderReorder
} from './agentControlVirtualFolderHandlers.js';
import {
  handleVirtualFolderDeleteSoft,
  handleVirtualFolderRestore,
  handleVirtualFolderUpdate
} from './agentControlVirtualFolderLifecycleHandlers.js';
import { isMaterialWritePath, isVirtualFolderWritePath, notifyAfterSuccessfulWrite } from './agentControlWriteNotifications.js';

export async function handleAgentControlMaterialRoute(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  pathname: string
) {
  const handler = MATERIAL_ROUTES[pathname];
  if (request.method !== 'POST' || !handler) return false;
  await handler(request, response, options);
  if (isMaterialWritePath(pathname)) notifyAfterSuccessfulWrite(response, options.notifyWorkspaceContentChanged);
  return true;
}

export async function handleAgentControlVirtualFolderRoute(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  pathname: string
) {
  const handler = VIRTUAL_FOLDER_ROUTES[pathname];
  if (request.method !== 'POST' || !handler) return false;
  await handler(request, response, options);
  if (isVirtualFolderWritePath(pathname)) notifyAfterSuccessfulWrite(response, options.notifyWorkspaceContentChanged);
  return true;
}

type Handler = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) => Promise<void>;

const MATERIAL_ROUTES: Record<string, Handler> = {
  '/agent-control/v1/materials/create': handleMaterialCreate,
  '/agent-control/v1/materials/delete-soft': handleMaterialDeleteSoft,
  '/agent-control/v1/materials/list-children': handleMaterialListChildren,
  '/agent-control/v1/materials/move': handleMaterialMove,
  '/agent-control/v1/materials/read': handleMaterialRead,
  '/agent-control/v1/materials/reorder': handleMaterialReorder,
  '/agent-control/v1/materials/restore': handleMaterialRestore,
  '/agent-control/v1/materials/search': handleMaterialSearch,
  '/agent-control/v1/materials/update': handleMaterialUpdate
};

const VIRTUAL_FOLDER_ROUTES: Record<string, Handler> = {
  '/agent-control/v1/virtual-folders/add-items': handleVirtualFolderAddItems,
  '/agent-control/v1/virtual-folders/create': handleVirtualFolderCreate,
  '/agent-control/v1/virtual-folders/delete-soft': handleVirtualFolderDeleteSoft,
  '/agent-control/v1/virtual-folders/list': handleVirtualFolderList,
  '/agent-control/v1/virtual-folders/read': handleVirtualFolderRead,
  '/agent-control/v1/virtual-folders/remove-items': handleVirtualFolderRemoveItems,
  '/agent-control/v1/virtual-folders/reorder': handleVirtualFolderReorder,
  '/agent-control/v1/virtual-folders/restore': handleVirtualFolderRestore,
  '/agent-control/v1/virtual-folders/update': handleVirtualFolderUpdate
};
