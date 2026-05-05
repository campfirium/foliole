export const APP_COMMAND_IDS = {
  toggleCommandPaletteMac: 'commandPalette.toggle.mac',
  toggleCommandPaletteWin: 'commandPalette.toggle.win',
  closeCommandPalette: 'ui.closeCommandPalette',
  closeSettings: 'ui.closeSettings',
  closeContextMenu: 'ui.closeContextMenu',
  goBack: 'navigation.goBack',
  goForward: 'navigation.goForward',
  goParent: 'navigation.goParent',
  toggleEditorDisplayMode: 'editor.toggleDisplayMode',
  startStudyMode: 'review.startStudyMode',
  revealReviewAnswer: 'review.revealAnswer',
  gradeReviewAgain: 'review.gradeAgain',
  gradeReviewHard: 'review.gradeHard',
  gradeReviewGood: 'review.gradeGood',
  gradeReviewEasy: 'review.gradeEasy',
  readingReviewLater: 'review.readingLater',
  readingReviewRead: 'review.readingRead',
  readingReviewDismiss: 'review.readingDismiss',
  openNotes: 'workspace.openNotes',
  openTrash: 'workspace.openTrash',
  openSettings: 'workspace.openSettings',
  toggleList: 'workspace.toggleList',
  toggleDevTools: 'workspace.toggleDevTools'
} as const;

export type AppCommandId = (typeof APP_COMMAND_IDS)[keyof typeof APP_COMMAND_IDS];
