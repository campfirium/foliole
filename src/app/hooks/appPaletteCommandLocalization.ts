import type { AppCommandId } from '../../shared/commands/ids';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { resolveSystemEntryDisplayName } from '../../shared/localization/systemEntryNames';
import type { TranslationKey } from '../../shared/localization/translations';

const COMMAND_TITLE_KEYS: Partial<Record<AppCommandId, TranslationKey>> = {
  [APP_COMMAND_IDS.createFolder]: 'desktop.command.createFolder',
  [APP_COMMAND_IDS.createTopic]: 'desktop.command.createTopic',
  [APP_COMMAND_IDS.createItem]: 'desktop.command.createItem',
  [APP_COMMAND_IDS.createVirtualFolder]: 'desktop.command.createVirtualFolder',
  [APP_COMMAND_IDS.undo]: 'desktop.command.undo',
  [APP_COMMAND_IDS.redo]: 'desktop.command.redo',
  [APP_COMMAND_IDS.openLocalFile]: 'desktop.command.openFile',
  [APP_COMMAND_IDS.importSingleFile]: 'desktop.command.importFiles',
  [APP_COMMAND_IDS.importFolder]: 'desktop.command.importFolder',
  [APP_COMMAND_IDS.clipboardImport]: 'desktop.command.importClipboard',
  [APP_COMMAND_IDS.openTrash]: 'desktop.command.openTrash',
  [APP_COMMAND_IDS.openGuidedSample]: 'desktop.command.openGuidedSample',
  [APP_COMMAND_IDS.renameNode]: 'desktop.command.rename',
  [APP_COMMAND_IDS.exportCurrentArticle]: 'desktop.command.exportCurrentTopic',
  [APP_COMMAND_IDS.publishToFoliole]: 'desktop.command.publishToFoliole',
  [APP_COMMAND_IDS.publishToDiscourse]: 'desktop.command.publishToDiscourse',
  [APP_COMMAND_IDS.publishToWordPress]: 'desktop.command.publishToWordPress',
  [APP_COMMAND_IDS.splitTopic]: 'desktop.command.splitTopic',
  [APP_COMMAND_IDS.mergeHighlightsIntoTopic]: 'desktop.command.mergeHighlights',
  [APP_COMMAND_IDS.createSelectionHighlight]: 'desktop.command.highlightSelection',
  [APP_COMMAND_IDS.createSelectionCloze]: 'desktop.command.clozeSelection',
  [APP_COMMAND_IDS.addSelectionNote]: 'desktop.command.annotateSelection',
  [APP_COMMAND_IDS.repairTable]: 'desktop.command.repairTable',
  [APP_COMMAND_IDS.restartApp]: 'desktop.command.restartApp',
  [APP_COMMAND_IDS.toggleList]: 'desktop.command.toggleLeftSidebar',
  [APP_COMMAND_IDS.toggleRightSidebar]: 'desktop.command.toggleRightSidebar',
  [APP_COMMAND_IDS.toggleBothSidebars]: 'desktop.command.toggleBothSidebars',
  [APP_COMMAND_IDS.increaseContentRegionScale]: 'desktop.command.increasePanelContentSize',
  [APP_COMMAND_IDS.decreaseContentRegionScale]: 'desktop.command.decreasePanelContentSize',
  [APP_COMMAND_IDS.resetContentRegionScale]: 'desktop.command.resetPanelContentSize',
  [APP_COMMAND_IDS.toggleDevTools]: 'desktop.command.toggleDevTools',
  [APP_COMMAND_IDS.openHelpSearch]: 'desktop.command.openHelpSearch',
  [APP_COMMAND_IDS.openWorkspaceSearch]: 'desktop.command.openWorkspaceSearch',
  [APP_COMMAND_IDS.openCommandPalette]: 'desktop.command.openCommandPalette',
  [APP_COMMAND_IDS.customizeDocumentMenu]: 'desktop.command.customizeDocumentMenu',
  [APP_COMMAND_IDS.goBack]: 'desktop.command.goBack',
  [APP_COMMAND_IDS.goForward]: 'desktop.command.goForward',
  [APP_COMMAND_IDS.goParent]: 'desktop.command.goParent',
  [APP_COMMAND_IDS.goToLastChild]: 'desktop.command.goToLastChild',
  [APP_COMMAND_IDS.goToNode]: 'desktop.command.goToNode',
  [APP_COMMAND_IDS.moveToNode]: 'desktop.command.moveToNode',
  [APP_COMMAND_IDS.scrollDocumentTop]: 'desktop.command.scrollDocumentTop',
  [APP_COMMAND_IDS.scrollDocumentBottom]: 'desktop.command.scrollDocumentBottom',
  [APP_COMMAND_IDS.findInTopic]: 'desktop.command.findInTopic',
  [APP_COMMAND_IDS.toggleComparisonView]: 'desktop.command.compareWithDraft',
  [APP_COMMAND_IDS.toggleDismissedTopicsVisibility]:
    'desktop.command.toggleDismissedTopicsVisibility',
  [APP_COMMAND_IDS.enterPriorityMode]: 'desktop.command.setPriority',
  [APP_COMMAND_IDS.toggleEditorDisplayMode]: 'desktop.command.toggleEditorDisplayMode',
  [APP_COMMAND_IDS.openSettings]: 'desktop.command.openSettings',
  [APP_COMMAND_IDS.openCustomCopy]: 'desktop.command.openCustomCopy',
  [APP_COMMAND_IDS.openReadwiseReaderSettings]: 'desktop.command.openReadwiseReaderSettings',
  [APP_COMMAND_IDS.toggleBaseColorMode]: 'desktop.command.cycleAppearanceMode',
  [APP_COMMAND_IDS.setPdfDarkAppearanceOriginal]: 'desktop.command.pdfDarkOriginal',
  [APP_COMMAND_IDS.setPdfDarkAppearanceInverted]: 'desktop.command.pdfDarkInverted',
  [APP_COMMAND_IDS.setPdfDarkAppearanceWarm]: 'desktop.command.pdfDarkWarm',
  [APP_COMMAND_IDS.closeSettings]: 'desktop.command.closeSettings',
  [APP_COMMAND_IDS.checkForUpdates]: 'desktop.command.checkForUpdates',
  [APP_COMMAND_IDS.openLatestRelease]: 'desktop.command.openReleases',
  [APP_COMMAND_IDS.openGitHubRepository]: 'desktop.command.openRepository',
  [APP_COMMAND_IDS.sendFeedback]: 'desktop.command.sendFeedback',
  [APP_COMMAND_IDS.openSupportEmail]: 'desktop.command.emailSupport',
  [APP_COMMAND_IDS.openGitHubIssues]: 'desktop.command.reportIssue',
  [APP_COMMAND_IDS.openGitHubDiscussions]: 'desktop.command.openDiscussions',
  [APP_COMMAND_IDS.startStudyMode]: 'desktop.command.flow.toggle',
  [APP_COMMAND_IDS.revealReviewAnswer]: 'desktop.command.review.revealAnswer',
  [APP_COMMAND_IDS.gradeReviewAgain]: 'desktop.command.review.gradeAgain',
  [APP_COMMAND_IDS.gradeReviewHard]: 'desktop.command.review.gradeHard',
  [APP_COMMAND_IDS.gradeReviewGood]: 'desktop.command.review.gradeGood',
  [APP_COMMAND_IDS.gradeReviewEasy]: 'desktop.command.review.gradeEasy',
  [APP_COMMAND_IDS.readingReviewSoon]: 'desktop.command.review.readingSoon',
  [APP_COMMAND_IDS.readingReviewLater]: 'desktop.command.review.readingLater',
  [APP_COMMAND_IDS.readingReviewPostpone]: 'desktop.command.review.postponeTopic',
  [APP_COMMAND_IDS.readingReviewRead]: 'desktop.command.review.read',
  [APP_COMMAND_IDS.readingReviewDismiss]: 'desktop.command.review.dismiss',
  [APP_COMMAND_IDS.reviewScrollReadingDown]: 'desktop.command.review.scrollDown',
  [APP_COMMAND_IDS.reviewScrollReadingUp]: 'desktop.command.review.scrollUp',
  [APP_COMMAND_IDS.deleteCurrentReviewItem]: 'desktop.command.review.deleteCurrentItem',
  [APP_COMMAND_IDS.reviewNavigateParent]: 'desktop.command.review.navigateParent',
  [APP_COMMAND_IDS.reviewNavigateBack]: 'desktop.command.review.navigateBack',
  [APP_COMMAND_IDS.reviewNavigateForward]: 'desktop.command.review.navigateForward',
  [APP_COMMAND_IDS.reviewNavigateDown]: 'desktop.command.review.navigateDown',
  [APP_COMMAND_IDS.reviewNavigatePreviousSibling]: 'desktop.command.review.navigatePreviousSibling',
  [APP_COMMAND_IDS.reviewNavigateNextSibling]: 'desktop.command.review.navigateNextSibling',
  [APP_COMMAND_IDS.deleteReviewSourceTopic]: 'desktop.command.review.deleteSourceTopic',
  [APP_COMMAND_IDS.resetImportData]: 'desktop.command.dev.resetImportData',
  [APP_COMMAND_IDS.reimportSelectedTopic]: 'desktop.command.dev.reimportSelectedTopic',
  [APP_COMMAND_IDS.openPerformancePanel]: 'desktop.command.dev.openPerformancePanel'
};

const SECTION_KEYS: Record<string, TranslationKey> = {
  Create: 'desktop.command.section.create',
  Workspace: 'desktop.command.section.workspace',
  Import: 'desktop.command.section.import',
  Editor: 'desktop.command.section.editor',
  Developer: 'desktop.command.section.developer',
  Settings: 'desktop.command.section.settings',
  Help: 'desktop.command.section.help',
  Navigation: 'desktop.command.section.navigation',
  Review: 'desktop.command.section.review',
  Flow: 'desktop.command.section.flow',
  View: 'desktop.command.section.view'
};

export function localizePaletteCommandTitle(id: string, fallback: string, t: Translate) {
  const key = COMMAND_TITLE_KEYS[id as AppCommandId];
  if (id === APP_COMMAND_IDS.openTrash && key) {
    return t(key, { trash: resolveSystemEntryDisplayName(getStoredAppLocale(), 'trash') });
  }
  return key ? t(key) : fallback;
}

export function localizePaletteCommandSection(section: string, t: Translate) {
  const key = SECTION_KEYS[section];
  return key ? t(key) : section;
}

export function resolveImmersiveModePaletteTitle(isImmersiveMode: boolean, t: Translate) {
  return t(
    isImmersiveMode
      ? 'desktop.command.exitImmersiveReading'
      : 'desktop.command.enterImmersiveReading'
  );
}

export function resolveReviewStatusMemoryPaletteTitle(isEnabled: boolean, t: Translate) {
  return t(
    isEnabled
      ? 'desktop.command.dev.disableReviewStatusMemory'
      : 'desktop.command.dev.enableReviewStatusMemory'
  );
}
