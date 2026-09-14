import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { folioleMarkdownLanguageExtensions } from '../model/folioleMarkdownParser';

import { cycleListTask, toggleTaskMarkerAt } from './codeMirrorListTaskCommands';
import { continueOrExitEmptyList } from './codeMirrorStructuredListCommands';
import { structuredListKeymap } from './codeMirrorStructuredListKeymap';

const hosts: HTMLElement[] = [];

function createView(
  doc: string,
  selection: EditorSelection | { anchor: number; head?: number },
  onUpdate?: (update: import('@codemirror/view').ViewUpdate) => void
) {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  return new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ base: markdownLanguage, extensions: folioleMarkdownLanguageExtensions }),
        EditorState.allowMultipleSelections.of(true),
        ...(onUpdate ? [EditorView.updateListener.of(onUpdate)] : [])
      ],
      selection
    })
  });
}

function runKey(view: EditorView, key: string) {
  const binding = structuredListKeymap.find((candidate) => candidate.key === key);
  if (!binding?.run) throw new Error(`Missing key binding: ${key}`);
  return binding.run(view);
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

describe('structured list indentation', () => {
  it('indents selected list items in one isolated transaction', () => {
    const transactions: Transaction[] = [];
    const view = createView('- one\n- two', { anchor: 0, head: 11 }, (update) => transactions.push(...update.transactions));

    expect(runKey(view, 'Tab')).toBe(true);
    expect(view.state.doc.toString()).toBe('  - one\n  - two');
    expect(transactions).toHaveLength(1);
  });

  it('outdents inside a quote without removing the quote prefix', () => {
    const view = createView('>   - child', { anchor: 11 });

    expect(runKey(view, 'Shift-Tab')).toBe(true);
    expect(view.state.doc.toString()).toBe('> - child');
  });

  it('leaves non-list Tab available for focus navigation', () => {
    const view = createView('plain text', { anchor: 3 });

    expect(runKey(view, 'Tab')).toBe(false);
    expect(view.state.doc.toString()).toBe('plain text');
  });
});

describe('structured list Enter', () => {
  it('promotes an empty nested task item one level', () => {
    const view = createView('- parent\n  - [ ] ', { anchor: 17 });

    expect(continueOrExitEmptyList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- parent\n- [ ] ');
  });

  it('exits after promoting the same empty item to the outer level', () => {
    const view = createView('- parent\n  - ', { anchor: 13 });

    expect(continueOrExitEmptyList(view)).toBe(true);
    expect(continueOrExitEmptyList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- parent\n');
  });

  it('exits an outer empty item in one action', () => {
    const view = createView('- one\n- ', { anchor: 8 });

    expect(continueOrExitEmptyList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- one\n');
  });

  it('defers nonempty list continuation to the Markdown keymap', () => {
    const view = createView('- one', { anchor: 5 });

    expect(continueOrExitEmptyList(view)).toBe(false);
  });
});

describe('structured list task cycling', () => {
  it('cycles plain, bullet, unchecked, checked, and bullet', () => {
    const view = createView('item', { anchor: 4 });

    for (const expected of ['- item', '- [ ] item', '- [x] item', '- item']) {
      expect(cycleListTask(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(expected);
    }
  });

  it('preserves ordered markers and advances selected items as a group', () => {
    const view = createView('1. first\n2. second', { anchor: 0, head: 18 });

    expect(cycleListTask(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('1. [ ] first\n2. [ ] second');
  });

  it('supports multiple cursors and preserves quote prefixes', () => {
    const selection = EditorSelection.create([
      EditorSelection.cursor(2),
      EditorSelection.cursor(10)
    ]);
    const view = createView('> first\n> second', selection);

    expect(cycleListTask(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('> - first\n> - second');
  });

  it('does not treat fenced code or frontmatter lookalikes as editable lists', () => {
    const code = createView('```\n- item\n```', { anchor: 6 });
    const frontmatter = createView('---\n- item\n---', { anchor: 6 });

    expect(cycleListTask(code)).toBe(false);
    expect(cycleListTask(frontmatter)).toBe(false);
  });
});

describe('task marker click command', () => {
  it('toggles source Markdown with an isolated history event and keeps selection', () => {
    let userEvent: string | undefined;
    const view = createView('- [ ] task', { anchor: 10 }, (update) => {
      userEvent = update.transactions[0]?.annotation(Transaction.userEvent);
    });

    expect(toggleTaskMarkerAt(view, 2, 5)).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] task');
    expect(view.state.selection.main.head).toBe(10);
    expect(userEvent).toBe('input.list');
  });
});
