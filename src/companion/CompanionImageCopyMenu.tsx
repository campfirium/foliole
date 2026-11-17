import { Copy, Scissors } from 'lucide-react';
import { useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { writeClipboardText } from '../shared/platform/companion/runtime/textClipboard';
import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '../shared/ui';

export function CompanionImageCopyMenu(props: {
  markdown: string;
  x: number;
  y: number;
  onClose(): void;
  onCut?: () => void;
  isCurrent(): boolean;
}) {
  const t = useTranslation();
  const pending = useRef(false);
  const [copying, setCopying] = useState(false);
  const [failed, setFailed] = useState(false);
  const viewport = window.visualViewport;
  const left = Math.max((viewport?.offsetLeft ?? 0) + 8,
    Math.min(props.x, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 204));
  const top = Math.max((viewport?.offsetTop ?? 0) + 8,
    Math.min(props.y, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - (props.onCut ? 156 : 112)));
  async function copy(cut = false) {
    if (pending.current || !props.isCurrent()) { if (!pending.current) props.onClose(); return; }
    pending.current = true;
    setCopying(true);
    setFailed(false);
    try {
      await writeClipboardText(props.markdown);
      if (props.isCurrent()) {
        if (cut) props.onCut?.();
        props.onClose();
      }
    } catch {
      if (props.isCurrent()) setFailed(true);
    } finally {
      pending.current = false;
      if (props.isCurrent()) setCopying(false);
    }
  }
  return <AppSelectionDropdownMenu left={left} top={top} onClose={props.onClose}>
    <AppSelectionDropdownMenuItem className="min-h-11" disabled={copying} onClick={() => { void copy(); }}>
      <Copy aria-hidden="true" size={16} />{t('desktop.editor.imageMenu.copy')}
    </AppSelectionDropdownMenuItem>
    {props.onCut ? <AppSelectionDropdownMenuItem className="min-h-11" disabled={copying} onClick={() => { void copy(true); }}>
      <Scissors aria-hidden="true" size={16} />{t('desktop.editor.imageMenu.cut')}
    </AppSelectionDropdownMenuItem> : null}
    {failed ? <p role="alert" className="max-w-44 px-2 py-1 text-ui-sm text-destructive">{t('companion.selection.copyError')}</p> : null}
  </AppSelectionDropdownMenu>;
}
