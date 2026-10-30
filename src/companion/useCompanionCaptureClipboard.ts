import { useEffect, useRef, useState } from 'react';

import { decideClipboardPasteSource } from '../../lib/clipboard/clipboardPasteSource';
import { readClipboardText } from '../shared/platform/textClipboard';

export function useCompanionCaptureClipboard(props: {
  disabled: boolean;
  draft: string;
  draftScope: string;
  onChange(text: string): void;
  open: boolean;
}) {
  const [isPasting, setIsPasting] = useState(false);
  const [error, setError] = useState<'empty' | 'failed' | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const attempt = useRef({ generation: 0, busy: false });
  useEffect(() => {
    setIsPasting(false);
    setError(null);
    attempt.current = { generation: attempt.current.generation + 1, busy: false };
    return () => { attempt.current.generation += 1; };
  }, [props.open, props.draftScope]);

  const paste = async () => {
    if (!props.open || props.disabled || attempt.current.busy) return;
    const generation = attempt.current.generation;
    const isCurrent = () => generation === attempt.current.generation && latest.current.open;
    attempt.current.busy = true;
    setIsPasting(true);
    setError(null);
    try {
      const source = decideClipboardPasteSource({ plainText: await readClipboardText() });
      if (!isCurrent() || latest.current.disabled) return;
      if (!source) return setError('empty');
      const { draft, onChange } = latest.current;
      onChange(draft + (draft && !draft.endsWith('\n') ? '\n' : '') + source.content);
    } catch {
      if (isCurrent()) setError('failed');
    } finally {
      if (isCurrent()) {
        attempt.current.busy = false;
        setIsPasting(false);
      }
    }
  };
  return { error, isPasting, paste };
}
