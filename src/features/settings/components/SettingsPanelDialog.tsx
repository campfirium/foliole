import type { ReactNode, Ref } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, settingsDialogSurfaceClassName } from '../../../shared/ui';
import { useHotkeySettings } from '../context/HotkeySettingsProvider';
import type { SettingsCategoryId } from '../model/settingsPanelOptions';
import type { SettingsSearchResult } from '../model/settingsSearch';

import {
  SettingsCategoryContent,
  type SettingsCategoryContentProps
} from './SettingsPanelSections';
import { SettingsSearchBox } from './SettingsSearchBox';
import { SettingsSidebar } from './SettingsSidebar';

import { definedProps } from '@/shared/lib/definedProps';

function resolveSettingsOverlayClassName(args: {
  isBackdropTransparent: boolean;
  isPreviewActive: boolean;
}) {
  return args.isPreviewActive || args.isBackdropTransparent ? 'bg-transparent' : undefined;
}

export type SettingsPanelCategoryProps = Omit<
  SettingsCategoryContentProps,
  'hotkeyItems' | 'onHotkeyReset' | 'onHotkeyResetAll' | 'onHotkeyUpdate' |
  'onRequestedCommandConsumed' | 'requestedCommandId'
>;

type SettingsPanelDialogProps = {
  activeCategory: SettingsCategoryId;
  activeResultIndex: number;
  categoryProps: SettingsPanelCategoryProps;
  contentNotice?: ReactNode;
  description: string;
  headerNotice?: ReactNode;
  hiddenCategoryIds?: SettingsCategoryId[];
  hotkeys: ReturnType<typeof useHotkeySettings>;
  headerActions?: ReactNode;
  isBackdropTransparent: boolean;
  isPreviewActive: boolean;
  onActiveResultIndexChange: (index: number) => void;
  onClose: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchResultSelect: (result: SettingsSearchResult) => void;
  scrollContainerRef: Ref<HTMLDivElement>;
  searchQuery: string;
  searchResults: SettingsSearchResult[];
  setActiveCategory: (category: SettingsCategoryId) => void;
  title: string;
};

function SettingsPanelDialogBody(props: SettingsPanelDialogProps) {
  const t = useTranslation();
  return (
    <>
      <SettingsSidebar
        activeCategory={props.activeCategory}
        {...definedProps({ brandBadge: props.categoryProps.previewDesktopSettings ? 'Demo' : undefined })}
        {...definedProps({ hiddenCategoryIds: props.hiddenCategoryIds })}
        setActiveCategory={props.setActiveCategory}
      />
      <div className="flex min-h-0 flex-col bg-settings-group">
        <div className="flex h-[64px] min-h-0 items-center justify-end border-b border-settings-divider/55 px-7">
          {props.headerNotice ? (
            <div className="min-w-0 flex-1 px-5">{props.headerNotice}</div>
          ) : (
            <SettingsSearchBox
              activeResultIndex={props.activeResultIndex}
              onActiveResultIndexChange={props.onActiveResultIndexChange}
              onQueryChange={props.onSearchQueryChange}
              onSelectResult={props.onSearchResultSelect}
              placeholder={t('settings.search.placeholder')}
              query={props.searchQuery}
              results={props.searchResults}
            />
          )}
        </div>
        <div className="app-scrollbar min-h-0 flex-1 scroll-pt-20 overflow-auto px-7 py-7" ref={props.scrollContainerRef}>
          {props.contentNotice ? <div className="mb-6 px-settings-panel-x">{props.contentNotice}</div> : null}
          <div className="mb-7 px-5 pb-6">
            <div className="flex items-center gap-3">
              <AppDialogTitle>{props.title}</AppDialogTitle>
              {props.headerActions ? (
                <div
                  className={
                    props.activeCategory === 'mouse-gestures' ? 'ml-auto shrink-0' : 'shrink-0'
                  }
                >
                  {props.headerActions}
                </div>
              ) : null}
            </div>
            <p className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground">{props.description}</p>
          </div>
          <SettingsCategoryContent {...props.categoryProps} {...props.hotkeys} />
        </div>
      </div>
    </>
  );
}

export function SettingsPanelDialog(props: SettingsPanelDialogProps) {
  const t = useTranslation();
  return (
    <AppDialog modal open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label={t('settings.overlay.aria')} className={resolveSettingsOverlayClassName(props)} onClick={props.isPreviewActive ? undefined : props.onClose} role="presentation" />
        {props.isPreviewActive ? <div className="fixed inset-0 z-modal-overlay" /> : null}
        <AppDialogContent
          aria-label={t('settings.dialog.aria')}
          aria-describedby={undefined}
          className={settingsDialogSurfaceClassName(`grid h-[min(860px,calc(100dvh-36px))] w-[min(1240px,calc(100vw-36px))] max-w-none grid-cols-[260px_minmax(0,1fr)] overflow-hidden ${props.isPreviewActive ? 'pointer-events-none opacity-0' : ''}`)}
          data-settings-root-dialog="true"
          onEscapeKeyDown={(event) => {
            if (props.searchQuery.trim().length > 0) {
              event.preventDefault();
            }
          }}
        >
          <SettingsPanelDialogBody {...props} />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
