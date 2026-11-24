import { Copy, MessageCircle, Pilcrow, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { writeClipboardText } from '../shared/platform/companion/runtime/textClipboard';
import { AppButton, AppSelectionDropdownMenuItem, appFloatingSurfaceClassName } from '../shared/ui';

import { openCompanionExternalUrl, resolveCompanionWebLookupActions, type CompanionWebLookupAction } from './companionWebLookup';

function useGuardedClipboard() {
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [copying, setCopying] = useState(false);
  async function copy(text: string) {
    if (pending.current) return null;
    pending.current = true;
    setCopying(true);
    try {
      await writeClipboardText(text);
      return mounted.current ? true : null;
    } catch {
      return mounted.current ? false : null;
    } finally {
      pending.current = false;
      if (mounted.current) setCopying(false);
    }
  }
  return { copying, copy };
}

function OverflowConfirmation(props: { onCancel(): void; onContinue(): void }) {
  const t = useTranslation();
  return <div className="p-2" role="status">
    <p className="text-ui-sm leading-5 text-foreground/78">{t('desktop.webLookup.selectionCopied')}</p>
    <div className="mt-2 flex justify-end gap-2">
      <AppButton onClick={props.onCancel} size="sm" variant="ghost">{t('desktop.webLookup.cancel')}</AppButton>
      <AppButton onClick={props.onContinue} size="sm" variant="default">{t('desktop.webLookup.continue')}</AppButton>
    </div>
  </div>;
}

function menuPosition(rect: DOMRect) {
  const below = Math.max(0, window.innerHeight - rect.bottom - 12);
  const above = Math.max(0, rect.top - 12);
  const openBelow = below >= 112 || below >= above;
  return {
    left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)),
    maxHeight: openBelow ? below : above,
    ...(openBelow ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 })
  };
}

export function CompanionSelectionMoreMenu(props: {
  rect: DOMRect;
  text: string;
  titleText?: string | null | undefined;
  onSelectParagraph?: (() => void) | undefined;
  onCopied: () => void;
  onOpenedLookup?: (() => void) | undefined;
}) {
  const t = useTranslation();
  const clipboard = useGuardedClipboard();
  const [error, setError] = useState<string | null>(null);
  const [overflowUrl, setOverflowUrl] = useState<string | null>(null);
  const [lookups] = useState(() => resolveCompanionWebLookupActions(props.text, props.titleText));
  async function copy() {
    setError(null);
    const copied = await clipboard.copy(props.text);
    if (copied) props.onCopied();
    else if (copied === false) setError(t('companion.selection.copyError'));
  }
  function openLookup(url: string) {
    openCompanionExternalUrl(url);
    props.onOpenedLookup?.();
  }
  async function runLookup(action: CompanionWebLookupAction) {
    if (!action.copyText) { openLookup(action.url); return; }
    setError(null);
    const copied = await clipboard.copy(action.copyText);
    if (copied) setOverflowUrl(action.url);
    else if (copied === false) setError(t('desktop.webLookup.copyFailed'));
  }
  return <div className={`${appFloatingSurfaceClassName('popover')} fixed z-dropdown w-[220px] max-w-[calc(100vw-16px)] overflow-y-auto p-1`}
    role="menu" style={menuPosition(props.rect)}>
    {overflowUrl ? <OverflowConfirmation onCancel={() => setOverflowUrl(null)} onContinue={() => openLookup(overflowUrl)} /> : <>
      <AppSelectionDropdownMenuItem disabled={clipboard.copying || !props.text} onClick={() => { void copy(); }}>
        <Copy aria-hidden="true" size={16} />
        {t('companion.selection.copyText')}
      </AppSelectionDropdownMenuItem>
      {props.onSelectParagraph ? <AppSelectionDropdownMenuItem disabled={clipboard.copying} onClick={props.onSelectParagraph}>
        <Pilcrow aria-hidden="true" size={16} />
        {t('companion.selection.selectParagraph')}
      </AppSelectionDropdownMenuItem> : null}
      {lookups.map(({ entry, action }) => <AppSelectionDropdownMenuItem key={entry.id} data-testid={`companion-selection-lookup-${entry.id}`}
        disabled={clipboard.copying} onClick={() => { void runLookup(action); }}>
        {action.kind === 'prompt' ? <MessageCircle aria-hidden="true" size={16} /> : <Search aria-hidden="true" size={16} />}
        <span className="min-w-0 truncate">{action.label}</span>
      </AppSelectionDropdownMenuItem>)}
    </>}
    {error ? <p className="px-2 py-1 text-ui-sm text-destructive" role="alert">{error}</p> : null}
  </div>;
}
