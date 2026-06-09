import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { net, protocol } from 'electron';

import {
  EXT_DOC_IMAGE_PROTOCOL_SCHEME,
  parseExtDocImageRenderUrl
} from '../../lib/platform/extDocImageProtocolUrl.js';
import { loadExternalSearchFolders } from '../database/externalSearchFolders.js';
import { resolveExternalPreviewImageResource } from '../database/externalSearchPreviewContent.js';

export { EXT_DOC_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/extDocImageProtocolUrl.js';

function isWithinFolder(filePath: string, folderPath: string) {
  const relative = path.relative(folderPath, filePath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveExternalPreviewFolder(documentAbsolutePath: string) {
  return (
    loadExternalSearchFolders()
      .filter((folder) => isWithinFolder(documentAbsolutePath, folder.folder_path))
      .sort((left, right) => right.folder_path.length - left.folder_path.length)[0] ?? null
  );
}

function buildMissingResponse(status: number) {
  return new Response(null, {
    headers: { 'cache-control': 'no-store' },
    status
  });
}

export function registerExtDocImageProtocolScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EXT_DOC_IMAGE_PROTOCOL_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    }
  ]);
}

export function registerExtDocImageProtocol() {
  protocol.handle(EXT_DOC_IMAGE_PROTOCOL_SCHEME, async (request) => {
    const parts = parseExtDocImageRenderUrl(request.url);
    if (!parts) {
      return buildMissingResponse(400);
    }

    const resource = resolveExternalPreviewImageResource(
      parts.imageDestination,
      parts.documentAbsolutePath,
      resolveExternalPreviewFolder(parts.documentAbsolutePath)
    );
    if (!resource) {
      return buildMissingResponse(404);
    }

    const response = await net.fetch(pathToFileURL(resource.filePath).toString());
    return new Response(response.body, {
      headers: {
        'cache-control': 'no-store',
        'content-type': resource.mimeType
      },
      status: response.status >= 200 && response.status <= 599 ? response.status : 200
    });
  });
}
