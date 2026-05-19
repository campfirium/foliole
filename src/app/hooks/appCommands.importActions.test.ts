import { describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { runAppCommand } from './appCommands';

function expectCommandRuns(commandId: string, overrides: Partial<Parameters<typeof runAppCommand>[1]>) {
  expect(runAppCommand(commandId, overrides as Parameters<typeof runAppCommand>[1])).toBe(true);
}

describe('runAppCommand import and document actions', () => {
  it('runs formal import through the shared command handler', () => {
    const importSingleFile = vi.fn();
    const importDirectory = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.importSingleFile, { importDirectory, importSingleFile });

    expect(importSingleFile).toHaveBeenCalledTimes(1);
    expect(importDirectory).not.toHaveBeenCalled();
  });

  it('runs export current article through the shared command handler', () => {
    const exportCurrentArticle = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.exportCurrentArticle, { exportCurrentArticle });

    expect(exportCurrentArticle).toHaveBeenCalledTimes(1);
  });

  it('runs merge highlights into topic through the shared command handler', () => {
    const mergeHighlightsIntoTopic = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.mergeHighlightsIntoTopic, { mergeHighlightsIntoTopic });

    expect(mergeHighlightsIntoTopic).toHaveBeenCalledTimes(1);
  });

  it('runs find in topic through the shared command handler', () => {
    const findInTopic = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.findInTopic, { findInTopic });

    expect(findInTopic).toHaveBeenCalledTimes(1);
  });

  it('runs enter priority mode through the shared command handler', () => {
    const enterPriorityMode = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.enterPriorityMode, { enterPriorityMode });

    expect(enterPriorityMode).toHaveBeenCalledTimes(1);
  });

  it('runs immersive reading toggle through the shared command handler', () => {
    const toggleImmersiveMode = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.toggleImmersiveMode, { toggleImmersiveMode });

    expect(toggleImmersiveMode).toHaveBeenCalledTimes(1);
  });
});
