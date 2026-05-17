import { AppIconButton, ToolbarActionGroup } from '../../shared/ui';

import { ArrowLeftIcon, ArrowRightIcon } from './DocumentPanelHeaderIcons';

export interface DocumentPanelHeaderNavigationProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
}

function NavigationButtons({ canGoBack, canGoForward, canGoParent, onGoBack, onGoForward, onGoParent }: DocumentPanelHeaderNavigationProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <AppIconButton className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground" disabled={!canGoBack} icon={<ArrowLeftIcon />} label="Go back" onClick={onGoBack} />
      <AppIconButton className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground" disabled={!canGoForward} icon={<ArrowRightIcon />} label="Go forward" onClick={onGoForward} />
      <button aria-label="Go to parent" className="sr-only" disabled={!canGoParent} onClick={onGoParent} type="button">
        Go to parent
      </button>
    </div>
  );
}

export function DocumentPanelHeaderNavigation(props: DocumentPanelHeaderNavigationProps) {
  return (
    <ToolbarActionGroup ariaLabel="Document navigation actions">
      <NavigationButtons {...props} />
    </ToolbarActionGroup>
  );
}

export function FolderListHeaderNavigation(props: DocumentPanelHeaderNavigationProps) {
  return (
    <div className="group h-12 w-28">
      <div className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <DocumentPanelHeaderNavigation {...props} />
      </div>
    </div>
  );
}
