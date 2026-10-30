import { registerPlugin } from '@capacitor/core';

import { getCompanionRuntimeCapability, requireCompanionNativePlugin } from './companionRuntimeCapabilities';

interface TextClipboardHost {
  readClipboardText(): Promise<{ text: string }>;
}

const nativeClipboard = registerPlugin<TextClipboardHost>('FolioleCompanionBootstrap');

/** Read only in response to an explicit paste action. Native failures must remain visible. */
export async function readClipboardText(): Promise<string> {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind === 'web-preview' || runtime.kind === 'browser-preview') {
    if (!navigator.clipboard?.readText) throw new Error('Text clipboard is unavailable.');
    return navigator.clipboard.readText();
  }
  requireCompanionNativePlugin('bootstrap', 'FolioleCompanionBootstrap');
  const result = await nativeClipboard.readClipboardText();
  if (typeof result?.text !== 'string') throw new Error('Invalid text clipboard response.');
  return result.text;
}
