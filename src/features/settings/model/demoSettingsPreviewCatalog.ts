import type { TranslationKey } from '../../../shared/localization/translations';

import type { SettingsCategoryId } from './settingsPanelOptions';

export type DemoSettingsPreviewControlKind =
  | 'button'
  | 'input'
  | 'select'
  | 'segmented'
  | 'slider'
  | 'status'
  | 'switch';

export type DemoSettingsPreviewNoteKind = 'desktop-only' | 'external-folders' | 'preview-only' | 'read-only';

export interface DemoSettingsPreviewItem {
  controlKind: DemoSettingsPreviewControlKind;
  demoNoteKind?: DemoSettingsPreviewNoteKind | null;
  descriptionKey: TranslationKey;
  id: string;
  titleKey: TranslationKey;
}

export interface DemoSettingsPreviewSection {
  categoryId: SettingsCategoryId;
  descriptionKey?: TranslationKey;
  demoNoteKind?: DemoSettingsPreviewNoteKind;
  id: string;
  items: DemoSettingsPreviewItem[];
  titleKey: TranslationKey;
}

export const DEMO_SETTINGS_PREVIEW_SECTIONS: DemoSettingsPreviewSection[] = [
  {
    id: 'about-support',
    categoryId: 'about',
    demoNoteKind: 'desktop-only',
    titleKey: 'settings.demoPreview.about.title',
    items: [
      { id: 'version', titleKey: 'settings.about.update.current', descriptionKey: 'settings.about.update.description.current', controlKind: 'status', demoNoteKind: null },
      { id: 'releases', titleKey: 'settings.about.openReleases', descriptionKey: 'settings.category.about.description', controlKind: 'button' },
      { id: 'feedback', titleKey: 'settings.about.feedback', descriptionKey: 'settings.category.about.description', controlKind: 'button' }
    ]
  },
  {
    id: 'general-system',
    categoryId: 'general',
    demoNoteKind: 'preview-only',
    titleKey: 'settings.general.system.section',
    items: [
      { id: 'language', titleKey: 'settings.general.language.row', descriptionKey: 'settings.general.language.description', controlKind: 'select' },
      { id: 'open-at-login', titleKey: 'settings.general.openAtLogin.title', descriptionKey: 'settings.general.openAtLogin.description', controlKind: 'switch', demoNoteKind: 'desktop-only' }
    ]
  },
  {
    id: 'appearance-interface',
    categoryId: 'appearance',
    demoNoteKind: 'preview-only',
    titleKey: 'settings.appearance.interface.section',
    items: [
      { id: 'color-mode', titleKey: 'settings.appearance.colorMode.row', descriptionKey: 'settings.appearance.colorMode.description', controlKind: 'segmented' },
      { id: 'action-help', titleKey: 'settings.appearance.actionHelp.row', descriptionKey: 'settings.appearance.actionHelp.description', controlKind: 'switch' }
    ]
  },
  {
    id: 'editor-live-markdown',
    categoryId: 'editor',
    demoNoteKind: 'preview-only',
    titleKey: 'settings.editor.liveMarkdown.section',
    items: [
      { id: 'remote-images', titleKey: 'settings.search.editorRemoteImages.title', descriptionKey: 'settings.search.editorRemoteImages.description', controlKind: 'switch' },
      { id: 'frontmatter', titleKey: 'settings.search.editorFrontmatter.title', descriptionKey: 'settings.search.editorFrontmatter.description', controlKind: 'input' },
      { id: 'cloze-guard', titleKey: 'settings.search.editorLongCloze.title', descriptionKey: 'settings.search.editorLongCloze.description', controlKind: 'select' }
    ]
  },
  {
    id: 'review-scheduler',
    categoryId: 'review',
    demoNoteKind: 'preview-only',
    titleKey: 'settings.review.section',
    items: [
      { id: 'retention', titleKey: 'settings.search.reviewRetention.title', descriptionKey: 'settings.review.desiredRetention.description', controlKind: 'slider' },
      { id: 'maximum-interval', titleKey: 'settings.search.reviewMaximumInterval.title', descriptionKey: 'settings.review.maximumInterval.description', controlKind: 'input' },
      { id: 'queue-mix', titleKey: 'settings.search.reviewMix.title', descriptionKey: 'settings.search.reviewMix.description', controlKind: 'slider' }
    ]
  },
  {
    id: 'web-lookup',
    categoryId: 'web-lookup',
    demoNoteKind: 'preview-only',
    titleKey: 'settings.webLookup.title',
    descriptionKey: 'settings.webLookup.description',
    items: [
      { id: 'menu-label', titleKey: 'settings.webLookup.header.menuLabel', descriptionKey: 'settings.webLookup.description', controlKind: 'input' },
      { id: 'menu-link', titleKey: 'settings.webLookup.header.link', descriptionKey: 'settings.webLookup.description', controlKind: 'input' },
      { id: 'shown', titleKey: 'settings.webLookup.header.shown', descriptionKey: 'settings.webLookup.description', controlKind: 'switch' }
    ]
  },
  {
    id: 'rail-actions',
    categoryId: 'rail',
    demoNoteKind: 'preview-only',
    titleKey: 'settings.rail.title',
    items: [
      { id: 'import', titleKey: 'settings.rail.item.import', descriptionKey: 'settings.category.rail.description', controlKind: 'switch' },
      { id: 'study', titleKey: 'settings.rail.item.study', descriptionKey: 'settings.category.rail.description', controlKind: 'switch' },
      { id: 'restore', titleKey: 'settings.rail.reset', descriptionKey: 'settings.category.rail.description', controlKind: 'button' }
    ]
  },
  {
    id: 'hotkeys',
    categoryId: 'hotkeys',
    demoNoteKind: 'desktop-only',
    titleKey: 'settings.demoPreview.hotkeys.title',
    descriptionKey: 'settings.category.hotkeys.description',
    items: [
      { id: 'search', titleKey: 'settings.demoPreview.hotkeys.search', descriptionKey: 'settings.category.hotkeys.description', controlKind: 'input' },
      { id: 'command', titleKey: 'settings.demoPreview.hotkeys.settings', descriptionKey: 'settings.category.hotkeys.description', controlKind: 'button' },
      { id: 'study', titleKey: 'settings.demoPreview.hotkeys.study', descriptionKey: 'settings.category.hotkeys.description', controlKind: 'button' }
    ]
  },
  {
    id: 'mouse-gestures',
    categoryId: 'mouse-gestures',
    demoNoteKind: 'desktop-only',
    titleKey: 'settings.demoPreview.mouseGestures.title',
    descriptionKey: 'settings.category.mouseGestures.description',
    items: [
      { id: 'active-area', titleKey: 'settings.search.gestureActiveArea.title', descriptionKey: 'settings.search.gestureActiveArea.description', controlKind: 'select' },
      { id: 'line-color', titleKey: 'settings.search.gestureLineColor.title', descriptionKey: 'settings.search.gestureLineColor.description', controlKind: 'button' },
      { id: 'threshold', titleKey: 'settings.search.gestureThreshold.title', descriptionKey: 'settings.search.gestureThreshold.description', controlKind: 'input' }
    ]
  },
  {
    id: 'library-locations',
    categoryId: 'library',
    demoNoteKind: 'desktop-only',
    titleKey: 'settings.library.title',
    items: [
      { id: 'main-folder', titleKey: 'settings.search.libraryHome.title', descriptionKey: 'settings.search.libraryHome.description', controlKind: 'button' },
      { id: 'attachments-folder', titleKey: 'settings.search.libraryAssets.title', descriptionKey: 'settings.search.libraryAssets.description', controlKind: 'button' },
      { id: 'mirror-folder', titleKey: 'settings.search.libraryMirror.title', descriptionKey: 'settings.search.libraryMirror.description', controlKind: 'button' }
    ]
  },
  {
    id: 'companion-sync',
    categoryId: 'companion-sync',
    demoNoteKind: 'desktop-only',
    titleKey: 'settings.companionSync.title',
    descriptionKey: 'settings.companionSync.description',
    items: [
      { id: 'enable-desktop', titleKey: 'settings.companionSync.enableDesktop.title', descriptionKey: 'settings.companionSync.description', controlKind: 'switch' },
      { id: 'connected-devices', titleKey: 'settings.companionSync.connected.title', descriptionKey: 'settings.companionSync.connected.description', controlKind: 'status', demoNoteKind: null },
      { id: 'primary-device', titleKey: 'settings.companionSync.primary.role.title', descriptionKey: 'settings.companionSync.primary.current.description', controlKind: 'select' }
    ]
  },
  {
    id: 'backups',
    categoryId: 'backups',
    demoNoteKind: 'desktop-only',
    titleKey: 'settings.backups.title',
    items: [
      { id: 'backup-location', titleKey: 'settings.backups.location.title', descriptionKey: 'settings.backups.location.description', controlKind: 'button' },
      { id: 'backup-scope', titleKey: 'settings.backups.scope.title', descriptionKey: 'settings.backups.scope.description', controlKind: 'status', demoNoteKind: null },
      { id: 'create-backup', titleKey: 'settings.backups.create.title', descriptionKey: 'settings.backups.desktopRequired.description', controlKind: 'button' }
    ]
  },
  {
    id: 'sources',
    categoryId: 'external-search',
    demoNoteKind: 'external-folders',
    titleKey: 'settings.externalSources.title',
    descriptionKey: 'settings.externalSources.description',
    items: [
      { id: 'external-enabled', titleKey: 'settings.externalSources.enabledLabel', descriptionKey: 'settings.externalSources.description', controlKind: 'switch' },
      { id: 'choose-folder', titleKey: 'settings.externalSources.chooseFolder', descriptionKey: 'settings.externalSources.desktopRequired', controlKind: 'button' },
      { id: 'readwise', titleKey: 'settings.readwise.row.title', descriptionKey: 'settings.readwise.row.description', controlKind: 'button' }
    ]
  },
  {
    id: 'watched-folders',
    categoryId: 'import',
    demoNoteKind: 'desktop-only',
    titleKey: 'settings.import.linkedFolders.title',
    descriptionKey: 'settings.import.linkedFolders.description',
    items: [
      { id: 'title-source', titleKey: 'settings.import.title.source', descriptionKey: 'settings.import.title.sourceDescription', controlKind: 'select' },
      { id: 'linked-folders', titleKey: 'settings.import.linkedFolders.title', descriptionKey: 'settings.import.linkedFolders.description', controlKind: 'button' },
      { id: 'imported-title', titleKey: 'settings.import.title.sectionTitle', descriptionKey: 'settings.import.title.description', controlKind: 'select' }
    ]
  },
  {
    id: 'readwise-reader',
    categoryId: 'readwise-reader',
    demoNoteKind: 'desktop-only',
    titleKey: 'settings.readwise.row.title',
    descriptionKey: 'settings.readwise.row.description',
    items: [
      { id: 'open-readwise', titleKey: 'settings.readwise.row.open', descriptionKey: 'settings.readwise.row.description', controlKind: 'button' },
      { id: 'status', titleKey: 'settings.demoPreview.readwise.status', descriptionKey: 'settings.category.readwiseReader.description', controlKind: 'status', demoNoteKind: null },
      { id: 'source-handling', titleKey: 'settings.backups.sourceHandling.title', descriptionKey: 'settings.backups.sourceHandling.description', controlKind: 'button' }
    ]
  }
];

export function getDemoSettingsPreviewSections(categoryId: SettingsCategoryId) {
  return DEMO_SETTINGS_PREVIEW_SECTIONS.filter((section) => section.categoryId === categoryId);
}

export function resolveDemoSettingsPreviewNoteKind(
  section: DemoSettingsPreviewSection,
  item: DemoSettingsPreviewItem
) {
  return item.demoNoteKind === undefined ? section.demoNoteKind ?? null : item.demoNoteKind;
}
