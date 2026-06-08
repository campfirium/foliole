import { type Range } from '@codemirror/state';
import { Decoration, type EditorView, WidgetType } from '@codemirror/view';

import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { MarkdownCodeFenceBlock } from '../model/markdownCodeFenceProjection';

function normalizeCopiedCodeBlockSource(source: string) {
  if (source.endsWith('\r\n')) return source.slice(0, -2);
  if (source.endsWith('\n')) return source.slice(0, -1);
  return source;
}

function writeClipboardText(text: string) {
  return navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('clipboard_unavailable'));
}

class CodeFenceCopyWidget extends WidgetType {
  readonly code: string;

  constructor(code: string) {
    super();
    this.code = code;
  }

  override eq(other: CodeFenceCopyWidget) {
    return this.code === other.code;
  }

  override ignoreEvent() {
    return false;
  }

  override toDOM() {
    const label = translate(getStoredAppLocale(), 'desktop.editorPreview.copyCode');
    const copiedLabel = translate(getStoredAppLocale(), 'desktop.editorPreview.copiedCode');
    const button = document.createElement('button');
    button.className = 'cm-md-code-copy-button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.type = 'button';
    button.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void writeClipboardText(this.code)
        .then(() => {
          button.dataset.copyStatus = 'copied';
          button.setAttribute('aria-label', copiedLabel);
          button.title = copiedLabel;
          window.setTimeout(() => {
            button.removeAttribute('data-copy-status');
            button.setAttribute('aria-label', label);
            button.title = label;
          }, 1200);
        })
        .catch(() => undefined);
    });
    return button;
  }
}

function shouldShowCopyButton(
  block: MarkdownCodeFenceBlock,
  viewport: { from: number; to: number }
) {
  return block.diagramKind === null && block.codeFrom < block.codeTo && block.blockFrom < viewport.to && block.blockTo > viewport.from;
}

export function addCodeFenceCopyDecorations(
  ranges: Range<Decoration>[],
  source: string,
  codeBlocks: readonly MarkdownCodeFenceBlock[],
  viewport: { from: number; to: number },
  view: EditorView
) {
  for (const block of codeBlocks) {
    if (!shouldShowCopyButton(block, viewport)) continue;

    const firstCodeLine = view.state.doc.lineAt(block.codeFrom);
    ranges.push(Decoration.line({ attributes: { class: 'cm-line-code-copy-start' } }).range(firstCodeLine.from));
    ranges.push(
      Decoration.widget({
        side: -1,
        widget: new CodeFenceCopyWidget(normalizeCopiedCodeBlockSource(source.slice(block.codeFrom, block.codeTo)))
      }).range(block.codeFrom)
    );
  }
}
