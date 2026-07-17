import { ArrowLeft, History, PenLine } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppIconButton,
  inspectorListInsetPaddingClassName
} from '../../shared/ui';

export function AssistantPanelToolbar(props: {
  conversationTitle: string | null;
  historyVisible: boolean;
  onBack: () => void;
  onShowHistory: () => void;
  onNewThread: () => void;
}) {
  const t = useTranslation();
  return (
    <header className={`${inspectorListInsetPaddingClassName} sticky top-0 z-10 border-b border-border/70 bg-bg/95 py-1 backdrop-blur-sm`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {props.conversationTitle ? (
            <AppIconButton
              icon={<ArrowLeft aria-hidden className="size-4" strokeWidth={1.8} />}
              label={t('desktop.rightPanel.assistant.backToHistory')}
              onClick={props.onBack}
            />
          ) : null}
          <h2
            className="m-0 min-w-0 truncate text-ui-md font-medium leading-6 text-foreground/86"
            title={props.conversationTitle ?? undefined}
          >
            {props.conversationTitle ?? t('desktop.rightPanel.assistant.title')}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <AppIconButton
            aria-pressed={props.historyVisible}
            className={props.historyVisible ? 'bg-foreground/[0.06] text-foreground' : undefined}
            icon={<History aria-hidden className="size-4" strokeWidth={1.8} />}
            label={t('desktop.rightPanel.assistant.history')}
            onClick={props.onShowHistory}
          />
          <AppIconButton
            icon={<PenLine aria-hidden className="size-4" strokeWidth={1.8} />}
            label={t('desktop.rightPanel.assistant.newThread')}
            onClick={props.onNewThread}
          />
        </div>
      </div>
    </header>
  );
}
