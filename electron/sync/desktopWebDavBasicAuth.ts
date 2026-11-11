import type { WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';

export type DesktopWebDavCredentials = { username: string; password: string };

function containsControlCharacter(value: string) {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function withDesktopWebDavBasicAuth(request: WebDavRelayRequest, root: URL,
  credentials: DesktopWebDavCredentials): WebDavRelayRequest {
  if (root.protocol !== 'https:' || root.username || root.password || root.search || root.hash ||
    !root.pathname.endsWith('/')) throw new Error('webdav_relay_https_required');
  const { username, password } = credentials;
  if (typeof username !== 'string' || !username.trim() || username.includes(':') ||
    typeof password !== 'string' || !password || containsControlCharacter(username + password)) {
    throw new Error('webdav_relay_invalid_credentials');
  }
  const authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  const origin = root.origin;
  const path = root.pathname;
  const withinRoot = (url: URL) => url.origin === origin && url.pathname.startsWith(path) &&
    !url.username && !url.password && !url.search && !url.hash;
  return async (url, input, receive) => {
    const destination = input.method === 'MOVE' && URL.parse(input.headers?.Destination ?? '');
    if (!withinRoot(url) || (input.method === 'MOVE' && (!destination || !withinRoot(destination)))) {
      throw new Error('webdav_relay_credential_scope_changed');
    }
    return request(url, { ...input, headers: { ...input.headers, Authorization: authorization } }, receive);
  };
}
