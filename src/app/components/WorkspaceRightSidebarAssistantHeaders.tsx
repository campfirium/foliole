import { ArrowLeft, History, PenLine } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppIconButton,
  inspectorListHeadingClassName,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

export function AssistantPanelToolbar(props: {
  historyVisible: boolean;
  onShowHistory: () => void;
  onNewThread: () => void;
}) {
  const t = useTranslation();
  return (
    <header className={`${inspectorListInsetPaddingClassName} sticky top-0 z-10 border-b border-border/70 bg-bg/95 py-1 backdrop-blur-sm`}>
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

export function AssistantHomeIntro() {
  const t = useTranslation();
  return (
    <p className={`${inspectorListInsetPaddingClassName} ${inspectorListMetaClassName} py-2`}>
      {t('desktop.rightPanel.assistant.description')}
    </p>
  );
}

export function AssistantConversationHeader(props: {
  onBack: () => void;
  title: string;
}) {
  const t = useTranslation();
  return (
    <header className={`${inspectorListInsetPaddingClassName} border-b border-border/70 py-1.5`}>
      <div className="flex items-center gap-2">
        <AppIconButton
          icon={<ArrowLeft aria-hidden className="size-4" strokeWidth={1.8} />}
          label={t('desktop.rightPanel.assistant.backToHistory')}
          onClick={props.onBack}
        />
        <h2
          className="m-0 min-w-0 flex-1 truncate text-ui-md font-medium leading-6 text-foreground/86"
          title={props.title}
        >
          {props.title}
        </h2>
      </div>
    </header>
  );
}
