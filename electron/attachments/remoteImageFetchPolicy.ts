import { isAllowedRemoteImageHostname } from './remoteImageUrlGuard.js';

export const REMOTE_IMAGE_MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class RemoteImagePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteImagePolicyError';
  }
}

export function isRemoteImageRedirectStatus(status: number) {
  return REDIRECT_STATUSES.has(status);
}

export function resolveRemoteImageRedirectTarget(currentUrl: string, location: string | null) {
  if (!location?.trim()) {
    throw new RemoteImagePolicyError('The remote image redirect did not include a supported target.');
  }
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    throw new RemoteImagePolicyError('The remote image redirect target is not supported.');
  }
}

export function validateRemoteImageFetchTarget(sourceUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl.trim());
  } catch {
    throw new RemoteImagePolicyError('The remote image URL is not supported.');
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !isAllowedRemoteImageHostname(parsed.hostname)) {
    throw new RemoteImagePolicyError('The remote image URL is not supported.');
  }
}
