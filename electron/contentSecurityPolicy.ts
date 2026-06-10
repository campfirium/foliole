import type { Session } from 'electron';

import { EXT_DOC_IMAGE_PROTOCOL_SCHEME } from '../lib/platform/extDocImageProtocolUrl.js';
import { REMOTE_IMAGE_PROTOCOL_SCHEME } from '../lib/platform/remoteImageProtocolUrl.js';

const CSP_HEADER = 'Content-Security-Policy';
const EXT_DOC_IMAGE_PROTOCOL_SOURCE = `${EXT_DOC_IMAGE_PROTOCOL_SCHEME}:`;
const REMOTE_IMAGE_PROTOCOL_SOURCE = `${REMOTE_IMAGE_PROTOCOL_SCHEME}:`;
const UPDATE_MANIFEST_ORIGIN = 'https://campfirium.github.io';
const FEEDBACK_ENDPOINT_ORIGIN = 'https://feedback.foliole.app';
const MAIN_WINDOW_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: file: foliole-asset: ${EXT_DOC_IMAGE_PROTOCOL_SOURCE} ${REMOTE_IMAGE_PROTOCOL_SOURCE}`,
  "font-src 'self' data:",
  `connect-src 'self' foliole-asset: ${UPDATE_MANIFEST_ORIGIN} ${FEEDBACK_ENDPOINT_ORIGIN}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "child-src 'none'",
  "media-src 'self' data: blob: file: foliole-asset:"
].join('; ');
const MAIN_WINDOW_DEV_CSP = MAIN_WINDOW_CSP
  .replace(
    "base-uri 'self'",
    "base-uri 'self' http://localhost:* http://127.0.0.1:*"
  )
  .replace(
    `img-src 'self' data: blob: file: foliole-asset: ${EXT_DOC_IMAGE_PROTOCOL_SOURCE} ${REMOTE_IMAGE_PROTOCOL_SOURCE}`,
    `img-src 'self' data: blob: file: foliole-asset: ${EXT_DOC_IMAGE_PROTOCOL_SOURCE} ${REMOTE_IMAGE_PROTOCOL_SOURCE} http://localhost:* http://127.0.0.1:*`
  )
  .replace(
    "script-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' http://localhost:* http://127.0.0.1:*"
  )
  .replace(
    "font-src 'self' data:",
    "font-src 'self' data: http://localhost:* http://127.0.0.1:*"
  )
  .replace(
    `connect-src 'self' foliole-asset: ${UPDATE_MANIFEST_ORIGIN} ${FEEDBACK_ENDPOINT_ORIGIN}`,
    `connect-src 'self' foliole-asset: ${UPDATE_MANIFEST_ORIGIN} ${FEEDBACK_ENDPOINT_ORIGIN} http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*`
  );

const installedSessions = new WeakSet<Session>();

interface MainWindowContentSecurityPolicyOptions {
  isPackaged?: boolean;
}

function isDevelopmentRendererUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

function isRuntimeRendererIndexUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/runtime-renderer-index.html');
  } catch {
    return false;
  }
}

function resolvePolicy(url: string, options: MainWindowContentSecurityPolicyOptions = {}) {
  const isPackaged = options.isPackaged ?? true;
  return !isPackaged && (isDevelopmentRendererUrl(url) || isRuntimeRendererIndexUrl(url))
    ? MAIN_WINDOW_DEV_CSP
    : MAIN_WINDOW_CSP;
}

function isFrameResource(resourceType: string) {
  return resourceType === 'mainFrame' || resourceType === 'subFrame';
}

export function withMainWindowContentSecurityPolicy(
  url: string,
  headers: Record<string, string[] | undefined> = {},
  options: MainWindowContentSecurityPolicyOptions = {}
) {
  return {
    ...headers,
    [CSP_HEADER]: [resolvePolicy(url, options)]
  };
}

export function installMainWindowContentSecurityPolicy(
  session: Session | undefined,
  options: MainWindowContentSecurityPolicyOptions = {}
) {
  if (!session || installedSessions.has(session)) {
    return;
  }
  installedSessions.add(session);
  // This hook is installed on the main window session; link panel webviews use
  // their own persistent partition and keep third-party pages outside this CSP.
  session.webRequest.onHeadersReceived((details, callback) => {
    if (!isFrameResource(details.resourceType)) {
      callback({});
      return;
    }
    callback({
      responseHeaders: withMainWindowContentSecurityPolicy(details.url, details.responseHeaders, options)
    });
  });
}
