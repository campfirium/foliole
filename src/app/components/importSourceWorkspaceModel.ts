export type ImportSourceTemplate = 'folder' | 'split_highlights' | 'watched_folder';
export type ImportConsumePolicy = 'archive' | 'clear' | 'keep';
export type ImportRunMode = 'one_off' | 'watch';
export type ImportTextHandling = 'adopt' | 'reference_only';

export interface DraftImportSource {
  consumePolicy: ImportConsumePolicy;
  highlightPath: string;
  id: string;
  name: string;
  primaryPath: string;
  runMode: ImportRunMode;
  scanInterval: string;
  template: ImportSourceTemplate;
  textHandling: ImportTextHandling;
}

export const importSourceSelectClassName =
  'h-10 w-full border border-border bg-bg-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong';

export function createDraftImportSource(template: ImportSourceTemplate, index: number): DraftImportSource {
  return {
    consumePolicy: template === 'watched_folder' ? 'archive' : 'keep',
    highlightPath: '',
    id: `draft-import-source-${index}`,
    name:
      template === 'watched_folder' ? `Watched folder ${index}` : template === 'split_highlights' ? `Split highlight source ${index}` : `Folder source ${index}`,
    primaryPath: '',
    runMode: template === 'watched_folder' ? 'watch' : 'one_off',
    scanInterval: template === 'watched_folder' ? 'Every 5 minutes' : 'Manual only',
    template,
    textHandling: 'reference_only'
  };
}

export function formatTemplateLabel(template: ImportSourceTemplate) {
  if (template === 'watched_folder') {
    return 'Watched folder';
  }
  if (template === 'split_highlights') {
    return 'Split highlights';
  }
  return 'Folder import';
}

export function formatRunModeLabel(runMode: ImportRunMode) {
  return runMode === 'watch' ? 'Watching' : 'One-off';
}
