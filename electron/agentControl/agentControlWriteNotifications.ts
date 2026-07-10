import type http from 'node:http';

import { isAgentControlWritePath } from '../../scripts/agent-control/foliole-agent-routes.mjs';

export function notifyAfterSuccessfulWrite(response: http.ServerResponse, notify?: () => void) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    notify?.();
  }
}

export function isMaterialWritePath(pathname: string) {
  return isAgentControlWritePath(pathname, 'material');
}

export function isVirtualFolderWritePath(pathname: string) {
  return isAgentControlWritePath(pathname, 'virtual_folder');
}
