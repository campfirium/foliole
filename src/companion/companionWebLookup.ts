import { isCompanionNativeHost } from '../shared/platform/companionRuntimeCapabilities';
import { getEnabledWebLookupEntries, resolveWebLookupAction, type WebLookupEntry } from '../shared/platform/webLookupEntries';

export type CompanionWebLookupAction = NonNullable<ReturnType<typeof resolveWebLookupAction>>;

export function resolveCompanionWebLookupActions(selectionText: string, titleText: string | null | undefined) {
  return getEnabledWebLookupEntries()
    .map(entry => ({ entry, action: resolveWebLookupAction(entry, { selectionText, titleText }) }))
    .filter((item): item is { entry: WebLookupEntry; action: CompanionWebLookupAction } => item.action !== null);
}

// Native shells hand top-level external navigation to the OS: an app that claims the link's domain
// (universal links / App Links) opens it, otherwise the default browser does.
export function openCompanionExternalUrl(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  if (!isCompanionNativeHost()) link.target = '_blank';
  link.click();
}
