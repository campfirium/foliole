import { Capacitor } from '@capacitor/core';

export const PDF_ORIGINAL_MINIMUM_CHROMIUM = 125;

export function getChromiumMajorVersion(userAgent = globalThis.navigator?.userAgent ?? '') {
  const match = /(?:Chrome|Chromium)\/(\d+)/u.exec(userAgent);
  return match ? Number(match[1]) : null;
}

/** PDF.js's published legacy baseline; eligibility does not imply device acceptance. */
export function isPdfOriginalUnsupported(
  platform = Capacitor.getPlatform(), userAgent = globalThis.navigator?.userAgent ?? ''
) {
  if (platform !== 'android') return false;
  const version = getChromiumMajorVersion(userAgent);
  return version !== null && version < PDF_ORIGINAL_MINIMUM_CHROMIUM;
}
