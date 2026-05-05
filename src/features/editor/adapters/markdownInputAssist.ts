import { EditorView } from '@codemirror/view';

interface CodeFenceCompletion {
  insertText: string;
  selectionOffset: number;
}

const CODE_FENCE_PATTERN = /^\s*`{3,}/;

export function shouldAutoCloseCodeFence(lineText: string, cursorOffset: number, typedText: string) {
  if (typedText !== '`') {
    return false;
  }

  const before = lineText.slice(0, cursorOffset);
  const after = lineText.slice(cursorOffset);
  return /^\s*``$/.test(before) && after.length === 0;
}

export function buildCodeFenceCompletion(lineText: string): CodeFenceCompletion {
  const indent = lineText.match(/^\s*/)?.[0] ?? '';
  const openingFence = `${indent}\`\`\``;
  const closingFence = `${indent}\`\`\``;
  return {
    insertText: `${openingFence}\n\n${closingFence}`,
    selectionOffset: openingFence.length + 1
  };
}

function findCodeFenceState(view: EditorView, lineNumber: number) {
  let inCodeBlock = false;
  let openingFenceIndent = '';

  for (let currentLineNumber = 1; currentLineNumber <= lineNumber; currentLineNumber += 1) {
    const line = view.state.doc.line(currentLineNumber);
    if (!CODE_FENCE_PATTERN.test(line.text)) {
      continue;
    }

    if (inCodeBlock) {
      inCodeBlock = false;
      openingFenceIndent = '';
    } else {
      inCodeBlock = true;
      openingFenceIndent = line.text.match(/^\s*/)?.[0] ?? '';
    }
  }

  return { inCodeBlock, openingFenceIndent };
}

function exitCodeBlockOnEnter(view: EditorView, from: number, to: number, text: string) {
  if (text !== '\n' || from !== to) {
    return false;
  }

  const line = view.state.doc.lineAt(from);
  const lineTextBeforeCursor = line.text.slice(0, from - line.from);
  if (line.text.trim().length !== 0 || lineTextBeforeCursor.trim().length !== 0) {
    return false;
  }

  const lineNumber = line.number;
  const { inCodeBlock, openingFenceIndent } = findCodeFenceState(view, lineNumber);
  if (!inCodeBlock) {
    return false;
  }

  const nextLine = lineNumber < view.state.doc.lines ? view.state.doc.line(lineNumber + 1) : null;
  if (nextLine && CODE_FENCE_PATTERN.test(nextLine.text)) {
    const anchor = nextLine.to < view.state.doc.length ? nextLine.to + 1 : nextLine.to;
    view.dispatch({ selection: { anchor } });
    return true;
  }

  const closingFence = `${openingFenceIndent}\`\`\``;
  view.dispatch({
    changes: { from, to, insert: `\n${closingFence}\n` },
    selection: { anchor: from + closingFence.length + 2 }
  });
  return true;
}

export const markdownInputAssist = EditorView.inputHandler.of((view, from, to, text) => {
  if (exitCodeBlockOnEnter(view, from, to, text)) {
    return true;
  }

  if (from !== to) {
    return false;
  }

  const line = view.state.doc.lineAt(from);
  const cursorOffset = from - line.from;

  if (!shouldAutoCloseCodeFence(line.text, cursorOffset, text)) {
    return false;
  }

  const completion = buildCodeFenceCompletion(line.text);
  view.dispatch({
    changes: {
      from: line.from,
      to: line.to,
      insert: completion.insertText
    },
    selection: {
      anchor: line.from + completion.selectionOffset
    }
  });
  return true;
});
