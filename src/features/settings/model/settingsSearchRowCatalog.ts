import { EN_TRANSLATIONS } from '../../../shared/localization/locales/en';
import type { TranslationKey } from '../../../shared/localization/translations';

import type { SettingsCategoryId } from './settingsPanelOptions';
import type { SettingsSearchRowMeta } from './settingsSearch';

type Translate = (key: TranslationKey) => string;

interface SearchRowDefinition {
  categoryId: SettingsCategoryId;
  descriptionKey: TranslationKey;
  id: string;
  searchTermsKey?: TranslationKey;
  titleKey: TranslationKey;
}

const SETTINGS_SEARCH_ROW_DEFINITIONS: SearchRowDefinition[] = [
  row('about', 'about-foliole-desktop', 'settings.search.aboutVersion.title', 'settings.search.aboutVersion.description', 'settings.search.aboutVersion.terms'),
  row('about', 'about-diagnostic-report', 'settings.search.aboutDiagnostic.title', 'settings.search.aboutDiagnostic.description'),
  row('about', 'about-community', 'settings.search.aboutCommunity.title', 'settings.search.aboutCommunity.description', 'settings.search.aboutCommunity.terms'),
  row('general', 'general-search-enhancement', 'settings.search.generalSearchEnhancement.title', 'settings.search.generalSearchEnhancement.description', 'settings.search.generalSearchEnhancement.terms'),
  row('appearance', 'appearance-app-language', 'settings.search.language.title', 'settings.search.language.description', 'settings.search.language.terms'),
  row('editor', 'editor-save-remote-images-locally', 'settings.search.editorRemoteImages.title', 'settings.search.editorRemoteImages.description', 'settings.search.editorRemoteImages.terms'),
  row('editor', 'editor-highlight-annotation-prefix', 'settings.search.editorHighlightPrefix.title', 'settings.search.editorHighlightPrefix.description'),
  row('editor', 'editor-frontmatter-meta', 'settings.search.editorFrontmatter.title', 'settings.search.editorFrontmatter.description'),
  row('editor', 'editor-long-cloze-mistake-guard', 'settings.search.editorLongCloze.title', 'settings.search.editorLongCloze.description'),
  row('review', 'review-desired-retention', 'settings.search.reviewRetention.title', 'settings.search.reviewRetention.description'),
  row('review', 'review-maximum-interval', 'settings.search.reviewMaximumInterval.title', 'settings.search.reviewMaximumInterval.description'),
  row('review', 'review-new-day-starts-at', 'settings.search.reviewDayStart.title', 'settings.search.reviewDayStart.description'),
  row('review', 'review-default-topic-priority', 'settings.search.reviewDefaultPriority.title', 'settings.search.reviewDefaultPriority.description'),
  row('review', 'review-reading-vs-review-mix', 'settings.search.reviewMix.title', 'settings.search.reviewMix.description'),
  row('review', 'review-priority-weight', 'settings.search.reviewPriorityWeight.title', 'settings.search.reviewPriorityWeight.description'),
  row('review', 'review-reading-initial-interval', 'settings.search.reviewInitialInterval.title', 'settings.search.reviewInitialInterval.description'),
  row('review', 'review-reading-interval-growth', 'settings.search.reviewIntervalGrowth.title', 'settings.search.reviewIntervalGrowth.description'),
  row('mouse-gestures', 'mouse-gestures-active-area', 'settings.search.gestureActiveArea.title', 'settings.search.gestureActiveArea.description'),
  row('mouse-gestures', 'mouse-gestures-line-color', 'settings.search.gestureLineColor.title', 'settings.search.gestureLineColor.description'),
  row('mouse-gestures', 'mouse-gestures-line-width', 'settings.search.gestureLineWidth.title', 'settings.search.gestureLineWidth.description'),
  row('mouse-gestures', 'mouse-gestures-direction-threshold', 'settings.search.gestureThreshold.title', 'settings.search.gestureThreshold.description'),
  row('library', 'library-home', 'settings.search.libraryHome.title', 'settings.search.libraryHome.description'),
  row('library', 'library-assets', 'settings.search.libraryAssets.title', 'settings.search.libraryAssets.description'),
  row('library', 'library-inbox', 'settings.search.libraryInbox.title', 'settings.search.libraryInbox.description'),
  row('library', 'library-mirror', 'settings.search.libraryMirror.title', 'settings.search.libraryMirror.description'),
  row('library', 'library-mirror-output', 'settings.search.libraryMirrorOutput.title', 'settings.search.libraryMirrorOutput.description'),
  row('library', 'library-mirror-links', 'settings.search.libraryMirrorLinks.title', 'settings.search.libraryMirrorLinks.description')
];

function row(
  categoryId: SettingsCategoryId,
  id: string,
  titleKey: TranslationKey,
  descriptionKey: TranslationKey,
  searchTermsKey?: TranslationKey
): SearchRowDefinition {
  return {
    categoryId,
    descriptionKey,
    id,
    titleKey,
    ...(searchTermsKey ? { searchTermsKey } : {})
  };
}

function splitSearchTerms(value: string) {
  return value.split('|').map((term) => term.trim()).filter(Boolean);
}

export function createSettingsSearchRows(t: Translate): SettingsSearchRowMeta[] {
  return SETTINGS_SEARCH_ROW_DEFINITIONS.map((definition) => {
    const searchTerms = definition.searchTermsKey ? splitSearchTerms(t(definition.searchTermsKey)) : [];
    return {
      categoryId: definition.categoryId,
      description: t(definition.descriptionKey),
      id: definition.id,
      title: t(definition.titleKey),
      ...(searchTerms.length ? { searchTerms } : {})
    };
  });
}

const ENGLISH_SETTINGS_SEARCH_ROWS = createSettingsSearchRows((key) => EN_TRANSLATIONS[key]);

export const SETTINGS_SEARCH_ROWS = ENGLISH_SETTINGS_SEARCH_ROWS;
