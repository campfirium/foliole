import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

function createLineClass(text: string, inCodeBlock: boolean) {
  if (/^\s*`{3,}/.test(text)) {
    return 'cm-line-code-fence';
  }
  if (inCodeBlock) {
    return 'cm-line-code';
  }
  if (/^#{1}\s+/.test(text)) {
    return 'cm-line-h1';
  }
  if (/^#{2}\s+/.test(text)) {
    return 'cm-line-h2';
  }
  if (/^#{3}\s+/.test(text)) {
    return 'cm-line-h3';
  }
  if (/^\s*>\s?/.test(text)) {
    return 'cm-line-quote';
  }
  if (/^\s*([-*+]\s+|\d+\.\s+)/.test(text)) {
    return 'cm-line-list';
  }
  return null;
}

function addPrefixDecoration(builder: RangeSetBuilder<Decoration>, from: number, text: string) {
  const prefixMatch = text.match(/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)/);
  if (!prefixMatch) {
    return;
  }

  const prefixLength = prefixMatch[0].length;
  builder.add(
    from,
    from + prefixLength,
    Decoration.mark({
      class: 'cm-md-prefix'
    })
  );
}

function buildLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let inCodeBlock = false;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const lineClass = createLineClass(line.text, inCodeBlock);

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

    addPrefixDecoration(builder, line.from, line.text);

    if (/^\s*`{3,}/.test(line.text)) {
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
      if (update.docChanged || update.viewportChanged) {
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
  '.cm-md-prefix': {
    color: 'var(--color-text-secondary)',
    opacity: '0.68'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(125, 211, 252, 0.1)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(56, 189, 248, 0.26)'
  }
});

export const liveMarkdown = [liveMarkdownTheme, markdownLinePlugin];
