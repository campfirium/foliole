import type { TranslationKey } from '../../../shared/localization/translations';

import type { SettingsCategoryId } from './settingsPanelOptions';
import type { SettingsSearchRowMeta } from './settingsSearch';

type Translate = (key: TranslationKey) => string;

interface SearchRowDefinition {
  categoryId: SettingsCategoryId;
  descriptionKey: TranslationKey;
  id: string;
  searchTermsKeys?: TranslationKey[];
  titleKey: TranslationKey;
}

export const SETTINGS_MODELS_SEARCH_ROW_ID = 'general-models';

const SETTINGS_SEARCH_ROW_DEFINITIONS: SearchRowDefinition[] = [
  row('about', 'about-foliole-desktop', 'settings.search.aboutVersion.title', 'settings.search.aboutVersion.description', 'settings.search.aboutVersion.terms'),
  row('about', 'about-cli', 'settings.search.aboutCli.title', 'settings.search.aboutCli.description', 'settings.search.aboutCli.terms'),
  row('about', 'about-feedback', 'settings.search.aboutFeedback.title', 'settings.search.aboutFeedback.description', 'settings.search.aboutFeedback.terms'),
  row('about', 'about-diagnostic-report', 'settings.search.aboutDiagnostic.title', 'settings.search.aboutDiagnostic.description'),
  row('about', 'about-community', 'settings.search.aboutCommunity.title', 'settings.search.aboutCommunity.description', 'settings.search.aboutCommunity.terms'),
  row('general', 'general-search-enhancement', 'settings.search.generalSearchEnhancement.title', 'settings.search.generalSearchEnhancement.description', 'settings.search.generalSearchEnhancement.terms'),
  row('general', 'general-language', 'settings.search.language.title', 'settings.search.language.description', 'settings.search.language.terms'),
  row('general', 'general-open-at-login', 'settings.search.generalOpenAtLogin.title', 'settings.search.generalOpenAtLogin.description', 'settings.search.generalOpenAtLogin.terms'),
  row('general', 'general-custom-copy', 'settings.customCopy.row', 'settings.customCopy.description', 'settings.customCopy.searchTerms'),
  row('general', 'general-action-help', 'settings.appearance.actionHelp.row', 'settings.appearance.actionHelp.description'),
  row('general', SETTINGS_MODELS_SEARCH_ROW_ID, 'settings.models.section', 'settings.models.description', 'settings.models.searchTerms'),
  row('typography', 'typography-text-font', 'settings.appearance.textFont.title', 'settings.appearance.textFont.description'),
  row('typography', 'typography-monospace-font', 'settings.appearance.monospaceFont.title', 'settings.appearance.monospaceFont.description'),
  row('typography', 'typography-reading-font-size', 'settings.appearance.fontSize.title', 'settings.appearance.fontSize.description'),
  row('typography', 'typography-reading-line-height', 'settings.appearance.lineHeight.title', 'settings.appearance.lineHeight.description'),
  row('typography', 'typography-paragraph-spacing', 'settings.appearance.paragraphSpacing.title', 'settings.appearance.paragraphSpacing.description'),
  row('typography', 'typography-reading-width', 'settings.appearance.readingWidth.title', 'settings.appearance.readingWidth.description'),
  row('typography', 'typography-navigation-row-spacing', 'settings.appearance.topicList.rowSpacing.title', 'settings.appearance.topicList.rowSpacing.description'),
  row('editor', 'editor-immersive-double-click-edit', 'settings.search.editorImmersiveDoubleClick.title', 'settings.search.editorImmersiveDoubleClick.description'),
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
  row('mouse-gestures', 'mouse-gestures-appearance', 'settings.mouseGestures.display.title', 'settings.category.mouseGestures.description',
    'settings.search.gestureLineColor.title', 'settings.search.gestureLineWidth.title',
    'settings.search.gestureThreshold.title', 'settings.mouseGestures.trail.opacity.title',
    'settings.mouseGestures.thresholds.pointSpacing.title'),
  row('mouse-gestures', 'mouse-gestures-bindings', 'settings.mouseGestures.bindings.title', 'settings.mouseGestures.enabled.description'),
  row('general', 'capture-confirmation-position', 'settings.capture.position.title', 'settings.capture.position.description'),
  row('library', 'library-home', 'settings.search.libraryHome.title', 'settings.search.libraryHome.description'),
  row('library', 'library-assets', 'settings.search.libraryAssets.title', 'settings.search.libraryAssets.description'),
  row('library', 'library-inbox', 'settings.search.libraryInbox.title', 'settings.search.libraryInbox.description'),
  row('library', 'library-import-root', 'settings.search.libraryImportRoot.title', 'settings.search.libraryImportRoot.description'),
  row('library', 'library-mirror', 'settings.search.libraryMirror.title', 'settings.search.libraryMirror.description'),
  row('library', 'library-mirror-output', 'settings.search.libraryMirrorOutput.title', 'settings.search.libraryMirrorOutput.description'),
  row('library', 'library-mirror-links', 'settings.search.libraryMirrorLinks.title', 'settings.search.libraryMirrorLinks.description')
];

function row(
  categoryId: SettingsCategoryId,
  id: string,
  titleKey: TranslationKey,
  descriptionKey: TranslationKey,
  ...searchTermsKeys: TranslationKey[]
): SearchRowDefinition {
  return {
    categoryId,
    descriptionKey,
    id,
    titleKey,
    ...(searchTermsKeys.length ? { searchTermsKeys } : {})
  };
}

function splitSearchTerms(value: string) {
  return value.split('|').map((term) => term.trim()).filter(Boolean);
}

export function createSettingsSearchRows(t: Translate): SettingsSearchRowMeta[] {
  return SETTINGS_SEARCH_ROW_DEFINITIONS.map((definition) => {
    const searchTerms = definition.searchTermsKeys?.flatMap((key) => splitSearchTerms(t(key))) ?? [];
    return {
      categoryId: definition.categoryId,
      description: t(definition.descriptionKey),
      id: definition.id,
      title: t(definition.titleKey),
      ...(searchTerms.length ? { searchTerms } : {})
    };
  });
}

export const SETTINGS_SEARCH_ROWS = createSettingsSearchRows((key) => key);
