import { Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { writeClipboardText } from '../shared/platform/companion/runtime/textClipboard';
import { AppSelectionDropdownMenuItem, appFloatingSurfaceClassName } from '../shared/ui';

export function CompanionSelectionCopyMenu(props: {
  left: number;
  top: number;
  text: string;
  onCopied: () => void;
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
  return <div className={`${appFloatingSurfaceClassName('popover')} fixed z-dropdown w-[188px] p-1`}
    role="menu" style={{ left: props.left, top: props.top }}>
    <AppSelectionDropdownMenuItem disabled={copying || !props.text} onClick={() => { void copy(); }}>
      <Copy aria-hidden="true" size={16} />
      {t('companion.selection.copyText')}
    </AppSelectionDropdownMenuItem>
    {failed ? <p className="px-2 py-1 text-ui-sm text-destructive" role="alert">{t('companion.selection.copyError')}</p> : null}
  </div>;
}
