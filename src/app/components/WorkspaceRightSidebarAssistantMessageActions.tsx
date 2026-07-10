import { Check, Copy, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton } from '../../shared/ui';

export function WorkspaceRightSidebarAssistantMessageActions(props: {
  align: 'left' | 'right';
  onEdit?: () => void;
  text: string;
}) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);
  return (
    <div className={`flex items-center ${props.align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <AppIconButton
        className="size-7 text-foreground/45"
        icon={copied
          ? <Check aria-hidden className="size-3.5" strokeWidth={1.8} />
          : <Copy aria-hidden className="size-3.5" strokeWidth={1.8} />}
        label={t(copied ? 'desktop.rightPanel.assistant.copied' : 'desktop.rightPanel.assistant.copyMessage')}
        onClick={() => void copyMessage(props.text, setCopied)}
      />
      {props.onEdit ? (
        <AppIconButton
          className="size-7 text-foreground/45"
          icon={<Pencil aria-hidden className="size-3.5" strokeWidth={1.8} />}
          label={t('desktop.rightPanel.assistant.editMessage')}
          onClick={props.onEdit}
        />
      ) : null}
    </div>
  );
}

async function copyMessage(text: string, setCopied: (copied: boolean) => void) {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  } catch {
    setCopied(false);
  }
}
