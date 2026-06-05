import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton } from '../../shared/ui';

import { ArrowLeftIcon, ArrowRightIcon } from './DocumentPanelHeaderIcons';

export interface FolderListNavigationOverlayProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
}

export function FolderListNavigationOverlay(props: FolderListNavigationOverlayProps) {
  const t = useTranslation();
  if (!props.canGoBack && !props.canGoForward) {
    return null;
  }

  return (
    <div className="sticky top-0 z-local-overlay h-0 w-0 overflow-visible">
      <div className="group absolute left-0 top-0 flex h-14 w-24 items-start justify-start">
        <div className="flex min-h-9 items-center rounded-md bg-[var(--app-floating-surface-bg)]/92 px-1 opacity-0 shadow-control backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <AppIconButton
            className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
            disabled={!props.canGoBack}
            icon={<ArrowLeftIcon />}
            label={t('desktop.navigation.back')}
            onClick={props.onGoBack}
          />
          <AppIconButton
            className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
            disabled={!props.canGoForward}
            icon={<ArrowRightIcon />}
            label={t('desktop.navigation.forward')}
            onClick={props.onGoForward}
          />
        </div>
      </div>
    </div>
  );
}
