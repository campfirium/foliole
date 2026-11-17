import { renderedListPrefixKeymap } from './liveMarkdownAtomicRanges';
import { markdownFrontmatterDecorations } from './liveMarkdownFrontmatter';
import { markdownInteractionHandlers } from './liveMarkdownInteractions';
import { markdownLinePlugin } from './liveMarkdownLinePlugin';
import { editedMathRangeField } from './liveMarkdownMathEditState';
import { protectCollapsedMathDeletion } from './liveMarkdownMathProtection';
import { liveMarkdownTheme } from './liveMarkdownTheme';
import { markdownImagePreviewUpdates } from './markdownImagePreviewBindings';

export function createLiveMarkdownExtensions() {
  return [
    liveMarkdownTheme,
    markdownImagePreviewUpdates,
    editedMathRangeField,
    protectCollapsedMathDeletion,
    markdownFrontmatterDecorations,
    markdownLinePlugin,
    renderedListPrefixKeymap,
    markdownInteractionHandlers
  ];
}
