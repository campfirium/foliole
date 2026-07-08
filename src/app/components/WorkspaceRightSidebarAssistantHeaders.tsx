import { ArrowLeft, History, PenLine } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppIconButton,
  inspectorListHeadingClassName,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

export function AssistantHomeHeader(props: {
  historyVisible: boolean;
  onNewThread: () => void;
  onToggleHistory: () => void;
}) {
  const t = useTranslation();
  return (
    <header className={`${inspectorListInsetPaddingClassName} pb-2 pt-1`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={`m-0 ${inspectorListHeadingClassName}`}>
          {t('desktop.rightPanel.assistant')}
        </h2>
        <div className="flex items-center gap-1">
          <AppIconButton
            aria-pressed={props.historyVisible}
            className={props.historyVisible ? 'bg-foreground/[0.06] text-foreground' : undefined}
            icon={<History aria-hidden className="size-4" strokeWidth={1.8} />}
            label={t('desktop.rightPanel.assistant.history')}
            onClick={props.onToggleHistory}
          />
          <AppIconButton
            icon={<PenLine aria-hidden className="size-4" strokeWidth={1.8} />}
            label={t('desktop.rightPanel.assistant.newThread')}
            onClick={props.onNewThread}
          />
        </div>
      </div>
      <p className={inspectorListMetaClassName}>
        {t('desktop.rightPanel.assistant.description')}
      </p>
    </header>
  );
}

export function AssistantConversationHeader(props: {
  onBack: () => void;
  onNewThread: () => void;
  title: string;
}) {
  const t = useTranslation();
  return (
    <header className={`${inspectorListInsetPaddingClassName} border-b border-border/70 pb-2 pt-1`}>
      <div className="flex items-center gap-2">
        <AppIconButton
          icon={<ArrowLeft aria-hidden className="size-4" strokeWidth={1.8} />}
          label={t('desktop.rightPanel.assistant.backToHistory')}
          onClick={props.onBack}
        />
        <h2 className="m-0 min-w-0 flex-1 truncate text-ui-md font-medium leading-6 text-foreground/86">
          {props.title}
        </h2>
        <AppIconButton
          icon={<PenLine aria-hidden className="size-4" strokeWidth={1.8} />}
          label={t('desktop.rightPanel.assistant.newThread')}
          onClick={props.onNewThread}
        />
      </div>
    </header>
  );
}
