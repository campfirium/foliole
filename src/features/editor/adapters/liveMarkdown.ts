import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const CODE_FENCE_PATTERN = /^\s*`{3,}/;
const PREFIX_PATTERN = /^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)/;
const INLINE_TOKEN_PATTERN = /(\*\*|__|~~|`+|!\[|\[|\]\(|\]|\(|\))/g;

function createLineClass(text: string, inCodeBlock: boolean) {
  if (CODE_FENCE_PATTERN.test(text)) {
    return 'cm-line-code-fence';
  }
  if (inCodeBlock) {
    return 'cm-line-code';
  }
  if (/^#{3}\s+/.test(text)) {
    return 'cm-line-h3';
  }
  if (/^#{2}\s+/.test(text)) {
    return 'cm-line-h2';
  }
  if (/^#{1}\s+/.test(text)) {
    return 'cm-line-h1';
  }
  if (/^\s*>\s?/.test(text)) {
    return 'cm-line-quote';
  }
  if (/^\s*([-*+]\s+|\d+\.\s+)/.test(text)) {
    return 'cm-line-list';
  }
  return null;
}

function addMark(builder: RangeSetBuilder<Decoration>, from: number, to: number, className: string) {
  if (to <= from) {
    return;
  }
  builder.add(
    from,
    to,
    Decoration.mark({
      class: className
    })
  );
}

function addReplace(builder: RangeSetBuilder<Decoration>, from: number, to: number) {
  if (to <= from) {
    return;
  }
  builder.add(from, to, Decoration.replace({}));
}

function addPrefixDecoration(
  builder: RangeSetBuilder<Decoration>,
  from: number,
  text: string,
  isCursorLine: boolean
) {
  const prefixMatch = text.match(PREFIX_PATTERN);
  if (!prefixMatch) {
    return;
  }

  const prefixLength = prefixMatch[0].length;
  if (isCursorLine) {
    addMark(builder, from, from + prefixLength, 'cm-md-syntax-visible');
    return;
  }
  addReplace(builder, from, from + prefixLength);
}

function addInlineTokenDecorations(
  builder: RangeSetBuilder<Decoration>,
  from: number,
  text: string,
  inCodeBlock: boolean,
  isCursorLine: boolean
) {
  if (inCodeBlock) {
    return;
  }

  let tokenMatch = INLINE_TOKEN_PATTERN.exec(text);

  while (tokenMatch) {
    const tokenFrom = from + tokenMatch.index;
    if (isCursorLine) {
      addMark(builder, tokenFrom, tokenFrom + tokenMatch[0].length, 'cm-md-syntax-visible');
    } else {
      addReplace(builder, tokenFrom, tokenFrom + tokenMatch[0].length);
    }
    tokenMatch = INLINE_TOKEN_PATTERN.exec(text);
  }

  INLINE_TOKEN_PATTERN.lastIndex = 0;
}

function getCursorLineNumber(view: EditorView) {
  const cursor = view.state.selection.main.head;
  return view.state.doc.lineAt(cursor).number;
}

function buildLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLineNumber = getCursorLineNumber(view);
  let inCodeBlock = false;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const lineClass = createLineClass(line.text, inCodeBlock);
    const isCursorLine = lineNumber === cursorLineNumber;

    if (lineClass) {
      builder.add(
        line.from,
        line.from,
        Decoration.line({
          attributes: {
            class: lineClass
          }
        })
      );
    }

    addPrefixDecoration(builder, line.from, line.text, isCursorLine);
    addInlineTokenDecorations(builder, line.from, line.text, inCodeBlock, isCursorLine);

    if (CODE_FENCE_PATTERN.test(line.text)) {
      inCodeBlock = !inCodeBlock;
    }
  }

  return builder.finish();
}

const markdownLinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

const liveMarkdownTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    height: '100%'
  },
  '.cm-scroller': {
    color: 'var(--color-text-primary)',
    lineHeight: '1.72'
  },
  '.cm-content': {
    fontFamily: 'var(--font-family-sans)',
    fontSize: 'var(--font-size-16)',
    padding: '1rem 1.1rem 2rem'
  },
  '.cm-line': {
    padding: 0
  },
  '.cm-line.cm-line-h1': {
    fontSize: '1.5rem',
    fontWeight: '700',
    letterSpacing: '-0.01em',
    marginBottom: '0.25rem',
    marginTop: '0.75rem'
  },
  '.cm-line.cm-line-h2': {
    fontSize: '1.25rem',
    fontWeight: '700',
    marginBottom: '0.2rem',
    marginTop: '0.65rem'
  },
  '.cm-line.cm-line-h3': {
    fontSize: '1.08rem',
    fontWeight: '650',
    marginTop: '0.5rem'
  },
  '.cm-line.cm-line-list': {
    paddingLeft: '0.2rem'
  },
  '.cm-line.cm-line-quote': {
    borderLeft: '3px solid var(--color-border-strong)',
    color: 'var(--color-text-secondary)',
    margin: '0.15rem 0',
    paddingLeft: '0.75rem'
  },
  '.cm-line.cm-line-code, .cm-line.cm-line-code-fence': {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    borderRadius: '0.35rem',
    fontFamily: 'var(--font-family-mono)',
    fontSize: '0.86rem',
    padding: '0.04rem 0.5rem'
  },
  '.cm-md-syntax-visible': {
    color: 'var(--color-text-secondary)',
    opacity: '0.58'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(125, 211, 252, 0.1)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(56, 189, 248, 0.26)'
  }
});

export const liveMarkdown = [liveMarkdownTheme, markdownLinePlugin];
