import { createHistoryCommands } from '../../store/historyCommands';

export function createPaletteHistoryActions(args: Parameters<typeof createHistoryCommands>[0]) {
  const commands = createHistoryCommands(args);
  return { redoWorkspaceAction: commands.redo, undoWorkspaceAction: commands.undo };
}
