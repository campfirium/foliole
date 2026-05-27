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

export type SettingsPanelCategoryProps = Omit<
  SettingsCategoryContentProps,
  'hotkeyItems' | 'onHotkeyReset' | 'onHotkeyResetAll' | 'onHotkeyUpdate'
>;

export function SettingsPanelDialog(props: {
  activeCategory: SettingsCategoryId;
  activeResultIndex: number;
  categoryProps: SettingsPanelCategoryProps;
  description: string;
  hotkeys: ReturnType<typeof useHotkeySettings>;
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
}) {
  return (
    <AppDialog modal open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label="Settings" className={props.isPreviewActive ? 'bg-transparent' : undefined} onClick={props.isPreviewActive ? undefined : props.onClose} role="presentation" />
        {props.isPreviewActive ? <div className="fixed inset-0 z-modal-overlay" /> : null}
        <AppDialogContent
          aria-label="Settings dialog"
          aria-describedby={undefined}
          className={`grid h-[min(800px,calc(100dvh-36px))] w-[min(1240px,calc(100vw-36px))] max-w-none grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded-lg border-settings-outline bg-settings-shell shadow-settings ${props.isPreviewActive ? 'pointer-events-none opacity-0' : ''}`}
          onEscapeKeyDown={(event) => {
            if (props.searchQuery.trim().length > 0) {
              event.preventDefault();
            }
          }}
        >
          <SettingsSidebar
            activeCategory={props.activeCategory}
            setActiveCategory={props.setActiveCategory}
          />
          <div className="app-scrollbar overflow-auto bg-settings-shell px-7 py-7" ref={props.scrollContainerRef}>
            <div className="mb-6 border-b border-settings-divider/45 px-5 pb-5">
              <SettingsSearchBox
                activeResultIndex={props.activeResultIndex}
                className="mb-5 max-w-[520px]"
                onActiveResultIndexChange={props.onActiveResultIndexChange}
                onQueryChange={props.onSearchQueryChange}
                onSelectResult={props.onSearchResultSelect}
                query={props.searchQuery}
                results={props.searchResults}
              />
              <AppDialogTitle>{props.title}</AppDialogTitle>
              <p className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground">{props.description}</p>
            </div>
            <SettingsCategoryContent {...props.categoryProps} {...props.hotkeys} />
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
