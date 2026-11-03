import { Capacitor } from '@capacitor/core';

/** PDF.js's published legacy baseline; eligibility does not imply device acceptance. */
export function isPdfOriginalUnsupported(
  platform = Capacitor.getPlatform(), userAgent = globalThis.navigator?.userAgent ?? ''
) {
  if (platform !== 'android') return false;
  const match = /(?:Chrome|Chromium)\/(\d+)/u.exec(userAgent);
  return match !== null && Number(match[1]) < 125;
}
