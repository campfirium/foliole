import { markdownFrontmatterDecorations } from './liveMarkdownFrontmatter';
import { markdownInteractionHandlers } from './liveMarkdownInteractions';
import { markdownLinePlugin } from './liveMarkdownLinePlugin';
import { liveMarkdownTheme } from './liveMarkdownTheme';

export function createLiveMarkdownExtensions() {
  return [
    liveMarkdownTheme,
    markdownFrontmatterDecorations,
    markdownLinePlugin,
    markdownInteractionHandlers
  ];
}
