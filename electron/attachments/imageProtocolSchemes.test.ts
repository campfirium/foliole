// @vitest-environment node

import { expect, it, vi } from 'vitest';

const { registerSchemesAsPrivileged } = vi.hoisted(() => ({
  registerSchemesAsPrivileged: vi.fn()
}));

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged }
}));

import { EXT_DOC_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/extDocImageProtocolUrl.js';
import { REMOTE_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/remoteImageProtocolUrl.js';

import { ATTACHMENT_PROTOCOL_SCHEME } from './attachmentAssetUrl.js';
import { registerImageProtocolSchemes } from './imageProtocolSchemes.js';

it('registers every image scheme in the single pre-ready privilege declaration', () => {
  registerImageProtocolSchemes();

  expect(registerSchemesAsPrivileged).toHaveBeenCalledTimes(1);
  expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
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
});
