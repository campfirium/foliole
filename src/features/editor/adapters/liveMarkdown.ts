import { markdownFrontmatterDecorations } from './liveMarkdownFrontmatter';
import { markdownInteractionHandlers } from './liveMarkdownInteractions';
import { markdownLinePlugin } from './liveMarkdownLinePlugin';
import { editedMathRangeField } from './liveMarkdownMathEditState';
import { protectCollapsedMathDeletion } from './liveMarkdownMathProtection';
import { liveMarkdownTheme } from './liveMarkdownTheme';

export function createLiveMarkdownExtensions() {
  return [
    liveMarkdownTheme,
    editedMathRangeField,
    protectCollapsedMathDeletion,
    markdownFrontmatterDecorations,
    markdownLinePlugin,
    markdownInteractionHandlers
  ];
}
