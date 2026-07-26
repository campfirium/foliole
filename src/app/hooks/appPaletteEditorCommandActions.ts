export interface PaletteEditorCommandRunnerArgs {
  addSelectionNote: () => void;
  createSelectionCloze: () => void;
  createSelectionHighlight: () => void;
  enterPriorityMode: () => void;
  exportCurrentArticle: () => Promise<boolean>;
  findInTopic: () => void;
  mergeHighlightsIntoTopic: () => Promise<boolean>;
  toggleComparisonView: () => void;
  publishToFoliole: () => Promise<boolean>;
  publishToDiscourse: () => Promise<boolean>;
  publishToWordPress: () => Promise<boolean>;
  repairTable: () => boolean;
}

export function createPaletteEditorCommandActions(args: PaletteEditorCommandRunnerArgs) {
  return {
    addSelectionNote: args.addSelectionNote,
    createSelectionCloze: args.createSelectionCloze,
    createSelectionHighlight: args.createSelectionHighlight,
    enterPriorityMode: args.enterPriorityMode,
    exportCurrentArticle: () => void args.exportCurrentArticle(),
    findInTopic: args.findInTopic,
    mergeHighlightsIntoTopic: () => void args.mergeHighlightsIntoTopic(),
    toggleComparisonView: args.toggleComparisonView,
    publishToFoliole: () => void args.publishToFoliole(),
    publishToDiscourse: () => void args.publishToDiscourse(),
    publishToWordPress: () => void args.publishToWordPress(),
    repairTable: args.repairTable
  };
}
