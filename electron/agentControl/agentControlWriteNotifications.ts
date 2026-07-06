import type http from 'node:http';

export function notifyAfterSuccessfulWrite(response: http.ServerResponse, notify?: () => void) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    notify?.();
  }
}

export function isMaterialWritePath(pathname: string) {
  return pathname === '/agent-control/v1/materials/update' ||
    pathname === '/agent-control/v1/materials/delete-soft';
}

export function isVirtualFolderWritePath(pathname: string) {
  return pathname === '/agent-control/v1/virtual-folders/create' ||
    pathname === '/agent-control/v1/virtual-folders/add-items' ||
    pathname === '/agent-control/v1/virtual-folders/remove-items' ||
    pathname === '/agent-control/v1/virtual-folders/reorder';
}