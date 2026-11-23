import { Copy, MessageCircleQuestionMark, Pilcrow } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { writeClipboardText } from '../shared/platform/companion/runtime/textClipboard';
import { AppSelectionDropdownMenuItem, appFloatingSurfaceClassName } from '../shared/ui';

import { openChatGptQuestion } from './companionAskChatGpt';

export function CompanionSelectionMoreMenu(props: {
  rect: DOMRect;
  text: string;
  onSelectParagraph?: (() => void) | undefined;
  onCopied: () => void;
  onAskedChatGpt?: (() => void) | undefined;
}) {
  const t = useTranslation();
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [copying, setCopying] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    if (pending.current) return;
    pending.current = true;
    setCopying(true);
    setFailed(false);
    try {
      await writeClipboardText(props.text);
      if (mounted.current) props.onCopied();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pending.current = false;
      if (mounted.current) setCopying(false);
    }
  }
  const { rect } = props;
  const below = Math.max(0, window.innerHeight - rect.bottom - 12);
  const above = Math.max(0, rect.top - 12);
  const openBelow = below >= 112 || below >= above;
  return <div className={`${appFloatingSurfaceClassName('popover')} fixed z-dropdown w-[188px] max-w-[calc(100vw-16px)] overflow-y-auto p-1`}
    role="menu" style={{
      left: Math.max(8, Math.min(rect.right - 188, window.innerWidth - 196)),
      maxHeight: openBelow ? below : above,
      ...(openBelow ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 })
    }}>
    <AppSelectionDropdownMenuItem disabled={copying || !props.text} onClick={() => { void copy(); }}>
      <Copy aria-hidden="true" size={16} />
      {t('companion.selection.copyText')}
    </AppSelectionDropdownMenuItem>
    {props.onSelectParagraph ? <AppSelectionDropdownMenuItem disabled={copying} onClick={props.onSelectParagraph}>
      <Pilcrow aria-hidden="true" size={16} />
      {t('companion.selection.selectParagraph')}
    </AppSelectionDropdownMenuItem> : null}
    <AppSelectionDropdownMenuItem data-testid="companion-selection-ask-chatgpt" disabled={!props.text.trim()}
      onClick={() => { if (openChatGptQuestion(props.text)) props.onAskedChatGpt?.(); }}>
      <MessageCircleQuestionMark aria-hidden="true" size={16} />
      {t('companion.selection.askChatGpt')}
    </AppSelectionDropdownMenuItem>
    {failed ? <p className="px-2 py-1 text-ui-sm text-destructive" role="alert">{t('companion.selection.copyError')}</p> : null}
  </div>;
}
