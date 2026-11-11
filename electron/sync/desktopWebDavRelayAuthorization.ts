import { createHash } from 'node:crypto';

import { webDavAuthenticationKey } from '../../lib/core/sync/webDavAuthenticationPause.js';
import type { WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';
import type { WebDavRelayBinding } from '../../lib/platform/webDavRelayContract.js';

import { withDesktopWebDavBasicAuth } from './desktopWebDavBasicAuth.js';
import { loadDesktopWebDavCredentialDraft, readCredentialOwner, requireActiveGroupKey } from './desktopWebDavCredentialSettings.js';

export function desktopWebDavAuthenticationKey(binding: WebDavRelayBinding,
  owner?: ReturnType<typeof readCredentialOwner>) {
  if (binding.credential_version === undefined) return undefined;
  const current = owner ?? readCredentialOwner(requireActiveGroupKey(binding.group_id));
  if (!current.ciphertext) return undefined;
  const revision = createHash('sha256').update(current.ciphertext).digest('hex');
  return webDavAuthenticationKey(binding, binding.desktop_device_id, current.libraryEpoch, revision);
}

export function authorizeDesktopWebDavRelay(binding: WebDavRelayBinding, request: WebDavRelayRequest,
  expectedAuthenticationKey?: string): WebDavRelayRequest {
  if (binding.credential_version === undefined) return request;
  let authorized: Promise<WebDavRelayRequest> | undefined;
  return async (url, input, receive) => {
    authorized ??= loadDesktopWebDavCredentialDraft(binding.group_id).then(({ draft, owner }) => {
      if (expectedAuthenticationKey && desktopWebDavAuthenticationKey(binding, owner) !== expectedAuthenticationKey) {
        throw new Error('webdav_relay_scope_changed');
      }
      if (draft.directory !== binding.directory_url) throw new Error('webdav_relay_credentials_unavailable');
      return withDesktopWebDavBasicAuth(request, new URL(draft.directory), draft);
    });
    return (await authorized)(url, input, receive);
  };
}
