import { codeFenceLineNumbersField } from './liveMarkdownCodeBlocks';
import { markdownInteractionHandlers } from './liveMarkdownInteractions';
import { markdownLinePlugin } from './liveMarkdownLinePlugin';
import { markdownStaticPlugin } from './liveMarkdownStaticDecorations';
import { liveMarkdownTheme } from './liveMarkdownTheme';

export function createLiveMarkdownExtensions() {
  return [
    liveMarkdownTheme,
    codeFenceLineNumbersField,
    markdownStaticPlugin,
    markdownLinePlugin,
    markdownInteractionHandlers
  ];
}
