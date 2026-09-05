import { protocol } from 'electron';

import { EXT_DOC_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/extDocImageProtocolUrl.js';
import { REMOTE_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/remoteImageProtocolUrl.js';

import { ATTACHMENT_PROTOCOL_SCHEME } from './attachmentAssetUrl.js';

export function registerImageProtocolSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATTACHMENT_PROTOCOL_SCHEME,
      privileges: {
        corsEnabled: true,
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    },
    {
      scheme: EXT_DOC_IMAGE_PROTOCOL_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    },
    {
      scheme: REMOTE_IMAGE_PROTOCOL_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    }
  ]);
}
