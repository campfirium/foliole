import type { WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';
import type { WebDavRelayBinding } from '../../lib/platform/webDavRelayContract.js';

import { withDesktopWebDavBasicAuth } from './desktopWebDavBasicAuth.js';
import { loadDesktopWebDavCredentialDraft } from './desktopWebDavCredentialSettings.js';

export function authorizeDesktopWebDavRelay(binding: WebDavRelayBinding, request: WebDavRelayRequest): WebDavRelayRequest {
  if (binding.credential_version === undefined) return request;
  let authorized: Promise<WebDavRelayRequest> | undefined;
  return async (url, input, receive) => {
    authorized ??= loadDesktopWebDavCredentialDraft(binding.group_id).then(({ draft }) => {
      if (draft.directory !== binding.directory_url) throw new Error('webdav_relay_credentials_unavailable');
      return withDesktopWebDavBasicAuth(request, new URL(draft.directory), draft);
    });
    return (await authorized)(url, input, receive);
  };
}
