import type { Ref } from 'react';

import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
import { useHotkeySettings } from '../context/HotkeySettingsProvider';
import type { SettingsCategoryId } from '../model/settingsPanelOptions';
import type { SettingsSearchResult } from '../model/settingsSearch';

import {
  SettingsCategoryContent,
  type SettingsCategoryContentProps
} from './SettingsPanelSections';
import { SettingsSearchBox } from './SettingsSearchBox';
import { SettingsSidebar } from './SettingsSidebar';

function resolveSettingsOverlayClassName(args: {
  isBackdropTransparent: boolean;
  isPreviewActive: boolean;
}) {
  return args.isPreviewActive || args.isBackdropTransparent ? 'bg-transparent' : undefined;
}

export type SettingsPanelCategoryProps = Omit<
  SettingsCategoryContentProps,
  'hotkeyItems' | 'onHotkeyReset' | 'onHotkeyResetAll' | 'onHotkeyUpdate'
>;

type SettingsPanelDialogProps = {
  activeCategory: SettingsCategoryId;
  activeResultIndex: number;
  categoryProps: SettingsPanelCategoryProps;
  description: string;
  hotkeys: ReturnType<typeof useHotkeySettings>;
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
  return (
    <>
      <SettingsSidebar
        activeCategory={props.activeCategory}
        setActiveCategory={props.setActiveCategory}
      />
      <div className="flex min-h-0 flex-col bg-settings-group">
        <div className="flex min-h-[64px] items-center justify-end border-b border-settings-divider/55 px-7">
          <SettingsSearchBox
            activeResultIndex={props.activeResultIndex}
            onActiveResultIndexChange={props.onActiveResultIndexChange}
            onQueryChange={props.onSearchQueryChange}
            onSelectResult={props.onSearchResultSelect}
            query={props.searchQuery}
            results={props.searchResults}
          />
        </div>
        <div className="app-scrollbar min-h-0 flex-1 overflow-auto px-7 py-7" ref={props.scrollContainerRef}>
          <div className="mb-7 px-5 pb-6">
            <AppDialogTitle>{props.title}</AppDialogTitle>
            <p className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground">{props.description}</p>
          </div>
          <SettingsCategoryContent {...props.categoryProps} {...props.hotkeys} />
        </div>
      </div>
    </>
  );
}

export function SettingsPanelDialog(props: SettingsPanelDialogProps) {
  return (
    <AppDialog modal open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label="Settings" className={resolveSettingsOverlayClassName(props)} onClick={props.isPreviewActive ? undefined : props.onClose} role="presentation" />
        {props.isPreviewActive ? <div className="fixed inset-0 z-modal-overlay" /> : null}
        <AppDialogContent
          aria-label="Settings dialog"
          aria-describedby={undefined}
          className={`grid h-[min(800px,calc(100dvh-36px))] w-[min(1240px,calc(100vw-36px))] max-w-none grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded-lg border-settings-outline bg-settings-group shadow-settings ${props.isPreviewActive ? 'pointer-events-none opacity-0' : ''}`}
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
