import type http from 'node:http';

import { loadWorkspaceVersionMetadata } from '../database/workspaceSnapshot.js';

import { buildCompanionSyncDiagnostics } from './buildCompanionSyncDiagnostics.js';
import {
  buildWorkspaceVersionPayload
} from './companionLanPayloads.js';
import { writeJson } from './companionLanResponses.js';

export const SYNC_DIAGNOSTICS_PATH = '/companion/diagnostics/sync';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';

export function handleWorkspaceMetadataGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  args: {
    appVersion: string;
    getSyncStatus: () => Parameters<typeof buildCompanionSyncDiagnostics>[0]['serverStatus'];
    deviceId: string;
  }
) {
  if (parsedRequestUrl.pathname === WORKSPACE_VERSION_PATH) {
    const version = loadWorkspaceVersionMetadata();
    writeJson(request, response, 200, buildWorkspaceVersionPayload(args.appVersion, args.deviceId, version));
    return true;
  }
  if (parsedRequestUrl.pathname === SYNC_DIAGNOSTICS_PATH) {
    writeJson(request, response, 200, buildCompanionSyncDiagnostics({
      appVersion: args.appVersion,
      serverStatus: args.getSyncStatus()
    }), 'GET, OPTIONS');
    return true;
  }
  return false;
}
