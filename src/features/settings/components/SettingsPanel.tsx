import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import { useHotkeySettings } from '../context/HotkeySettingsProvider';
import {
  getSettingsCategoryOption,
  getInitialSettingsCategory,
  SETTINGS_CATEGORY_STORAGE_KEY,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import { SettingsMouseGesturesHeaderControl } from './sections/SettingsMouseGesturesSection';
import {
  SettingsPanelDialog,
  type SettingsPanelCategoryProps
} from './SettingsPanelDialog';
import { useExternalSearchFolders } from './useExternalSearchFolders';
import { useLibraryPathSettings } from './useLibraryPathSettings';
import {
  useSettingsPanelEscape,
  useSettingsPreviewMode
} from './useSettingsPanelChrome';
import {
  useSettingsSearchState,
  useSettingsSearchTarget
} from './useSettingsSearch';

import { definedProps } from '@/shared/lib/definedProps';
import { AppStatusBadge } from '@/shared/ui';

interface SettingsPanelProps {
  contentNotice?: ReactNode;
  headerNotice?: ReactNode;
  importCategoryContent?: ReactNode;
  onClose: () => void;
  previewDesktopSettings?: boolean;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  readwiseReaderCategoryContent?: ReactNode;
  requestedCategory?: SettingsCategoryId | null;
  requestedRowId?: string | null;
}

export function SettingsPanel(props: SettingsPanelProps) {
  return <SettingsPanelContent {...props} />;
}

function SettingsPanelContent(props: SettingsPanelProps) {
  const hotkeys = useHotkeySettings();
  const requestedCategory = hotkeys.requestedCommandId ? 'hotkeys' : props.requestedCategory ?? null;
  const state = useSettingsPanelViewState(requestedCategory);
  return <SettingsPanelBody {...props} {...state} />;
}

function useSettingsPanelViewState(requestedCategory: SettingsCategoryId | null) {
  const t = useTranslation();
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(() =>
    requestedCategory ?? getInitialSettingsCategory() ?? 'general'
  );
  const libraryPathSettings = useLibraryPathSettings();
  const externalSearchFolders = useExternalSearchFolders();

  useEffect(() => setWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY, activeCategory), [activeCategory]);
  useEffect(() => {
    if (requestedCategory) {
      setActiveCategory(requestedCategory);
    }
  }, [requestedCategory]);
  const category = getSettingsCategoryOption(activeCategory, t);
  const title = category?.label ?? t('settings.title');
  const description = category?.description ?? t('settings.description');

  return {
    activeCategory,
    description,
    setActiveCategory,
    title,
    ...externalSearchFolders,
    ...libraryPathSettings
  };
}

type SettingsPanelBodyProps = {
  activeCategory: SettingsCategoryId;
  assetsPath: string;
  errorByLocation: Record<'assets_dir' | 'inbox' | 'library_home' | 'mirror', string | null>;
  externalSearchError: string | null;
  externalSearchFeedback: string | null;
  externalSearchFolders: ReturnType<typeof useExternalSearchFolders>['externalSearchFolders'];
  inboxPath: string;
  isDesktopRuntime: boolean;
  isLoadingLibraryPaths: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  isLoadingExternalSearchFolders: boolean;
  isSavingExternalSearchFolders: boolean;
  libraryHomePath: string;
  description: string;
  contentNotice?: ReactNode;
  headerNotice?: ReactNode;
  mirrorLinkRebuildError: string | null;
  mirrorLinkRebuildFeedback: string | null;
  mirrorOutputRebuildError: string | null;
  mirrorOutputRebuildFeedback: string | null;
  mirrorPath: string;
  importCategoryContent?: ReactNode;
  onClose: () => void;
  onChangeLocation: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onAddExternalSearchFolder: () => void;
  onChooseExternalAttachmentRoot: (folderId: string) => void;
  onChooseExternalSearchFolder: (folderId: string) => void;
  onDisconnectExternalSearchFolder: (folderId: string) => void;
  onReconnectExternalSearchFolder: (folderId: string) => void;
  onRebuildExternalSearchIndex: (folderId?: string) => void;
  onRemoveExternalSearchFolder: (folderId: string) => void;
  onReplaceExternalSourceHost: (hostName: string) => void;
  onRetryLoadExternalSearchFolders: () => void;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onRestoreDefault: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onUpdateExternalSearchFolder: ReturnType<typeof useExternalSearchFolders>['onUpdateExternalSearchFolder'];
  pendingLocation: 'assets_dir' | 'inbox' | 'library_home' | 'mirror' | null;
  previewDesktopSettings?: boolean;
  readwiseReaderCategoryContent?: ReactNode;
  requestedRowId?: string | null;
  setActiveCategory: (category: SettingsCategoryId) => void;
  title: string;
};

function createSettingsCategoryProps(
  props: SettingsPanelBodyProps,
  setIsBackdropTransparent: (value: boolean) => void,
  setIsPreviewActive: (value: boolean) => void
): SettingsPanelCategoryProps {
  return {
    activeCategory: props.activeCategory,
    assetsPath: props.assetsPath,
    errorByLocation: props.errorByLocation,
    externalSearchError: props.externalSearchError,
    externalSearchFeedback: props.externalSearchFeedback,
    externalSearchFolders: props.externalSearchFolders,
    inboxPath: props.inboxPath,
    isDesktopRuntime: props.isDesktopRuntime,
    isLoadingLibraryPaths: props.isLoadingLibraryPaths,
    isRebuildingMirrorLinks: props.isRebuildingMirrorLinks,
    isRebuildingMirrorOutput: props.isRebuildingMirrorOutput,
    isLoadingExternalSearchFolders: props.isLoadingExternalSearchFolders,
    isSavingExternalSearchFolders: props.isSavingExternalSearchFolders,
    libraryHomePath: props.libraryHomePath,
    mirrorLinkRebuildError: props.mirrorLinkRebuildError,
    mirrorLinkRebuildFeedback: props.mirrorLinkRebuildFeedback,
    mirrorOutputRebuildError: props.mirrorOutputRebuildError,
    mirrorOutputRebuildFeedback: props.mirrorOutputRebuildFeedback,
    mirrorPath: props.mirrorPath,
    ...definedProps({ importCategoryContent: props.importCategoryContent }),
    onChangeLocation: props.onChangeLocation,
    onAddExternalSearchFolder: props.onAddExternalSearchFolder,
    onChooseExternalAttachmentRoot: props.onChooseExternalAttachmentRoot,
    onChooseExternalSearchFolder: props.onChooseExternalSearchFolder,
    onDisconnectExternalSearchFolder: props.onDisconnectExternalSearchFolder,
    onReconnectExternalSearchFolder: props.onReconnectExternalSearchFolder,
    onRebuildExternalSearchIndex: props.onRebuildExternalSearchIndex,
    onRemoveExternalSearchFolder: props.onRemoveExternalSearchFolder,
    onReplaceExternalSourceHost: props.onReplaceExternalSourceHost,
    onRetryLoadExternalSearchFolders: props.onRetryLoadExternalSearchFolders,
    ...definedProps({ onRunSupportCommand: props.onRunSupportCommand }),
    onRebuildMirrorLinks: props.onRebuildMirrorLinks,
    onRebuildMirrorOutput: props.onRebuildMirrorOutput,
    onRestoreDefault: props.onRestoreDefault,
    onUpdateExternalSearchFolder: props.onUpdateExternalSearchFolder,
    pendingLocation: props.pendingLocation,
    ...definedProps({ previewDesktopSettings: props.previewDesktopSettings }),
    ...definedProps({ readwiseReaderCategoryContent: props.readwiseReaderCategoryContent }),
    onEnterPreview: () => setIsPreviewActive(true),
    onSettingsBackdropTransparentChange: setIsBackdropTransparent
  };
}

function SettingsPanelBody(props: SettingsPanelBodyProps) {
  const t = useTranslation();
  const hotkeys = useHotkeySettings();
  const preview = useSettingsPreviewMode();
  const [isBackdropTransparent, setIsBackdropTransparent] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const searchQueryRef = useRef('');
  const search = useSettingsSearchState(props.setActiveCategory, props.requestedRowId ?? null);
  searchQueryRef.current = search.query;
  const categoryProps = createSettingsCategoryProps(props, setIsBackdropTransparent, preview.setIsPreviewActive);
  useSettingsPanelEscape(preview.isPreviewActive, searchQueryRef, props.onClose);
  useSettingsSearchTarget(props.activeCategory, search.targetRowId, scrollContainerRef, search.targetBlock);

  return (
    <SettingsPanelDialog
      activeCategory={props.activeCategory}
      activeResultIndex={search.activeResultIndex}
      categoryProps={categoryProps}
      contentNotice={props.contentNotice}
      description={props.description}
      headerNotice={props.headerNotice}
      hotkeys={hotkeys}
      headerActions={
        props.activeCategory === 'companion-sync' ? (
          <AppStatusBadge label={t('settings.companionSync.status.inDevelopment')} />
        ) : props.activeCategory === 'mouse-gestures' ? (
          <SettingsMouseGesturesHeaderControl />
        ) : undefined
      }
      isBackdropTransparent={isBackdropTransparent}
      isPreviewActive={preview.isPreviewActive}
      onActiveResultIndexChange={search.setActiveResultIndex}
      onClose={props.onClose}
      onSearchQueryChange={search.updateQuery}
      onSearchResultSelect={search.selectResult}
      scrollContainerRef={scrollContainerRef}
      searchQuery={search.query}
      searchResults={search.results}
      setActiveCategory={props.setActiveCategory}
      title={props.title}
    />
  );
}
