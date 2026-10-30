import { registerPlugin } from '@capacitor/core';

import { getCompanionRuntimeCapability, requireCompanionNativePlugin } from '../../companionRuntimeCapabilities';

interface TextClipboardHost {
  writeClipboardText(options: { text: string }): Promise<void>;
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

/** Write only after an explicit copy action; preserve native failures for the caller. */
export async function writeClipboardText(text: string): Promise<void> {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind === 'web-preview' || runtime.kind === 'browser-preview') {
    if (!navigator.clipboard?.writeText) throw new Error('Text clipboard is unavailable.');
    await navigator.clipboard.writeText(text);
    return;
  }
  requireCompanionNativePlugin('bootstrap', 'FolioleCompanionBootstrap');
  await nativeClipboard.writeClipboardText({ text });
}
