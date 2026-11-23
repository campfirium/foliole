import { describe, expect, it } from 'vitest';

import { allocateAideAttachedContext } from './aideAttachedContextAllocation.js';
import { buildAideAttachedContextCandidates, type AideContextSnapshot } from './aideAttachedContextCandidates.js';
import { formatAideAttachedContext } from './aideAttachedContextFormat.js';
import { createDefaultAideAttachedContextSettings } from './aideAttachedContextSettings.js';
import type { AideContextNode } from './aideAttachedContextSource.js';

const folder = (id: string, title: string): AideContextNode => ({ anchor: null, content: '', id, kind: 'folder', title });

function attach(snapshot: AideContextSnapshot) {
  const items = allocateAideAttachedContext(
    buildAideAttachedContextCandidates(snapshot),
    createDefaultAideAttachedContextSettings()
  );
  return formatAideAttachedContext({ items, materialId: snapshot.focus.id, title: snapshot.focus.title });
}

function highlightOf(body: string, text: string, id = 'h1'): AideContextNode {
  const from = body.indexOf(text);
  return {
    anchor: { id: `a-${id}`, kind: 'highlight', locator: { from, originalText: text, to: from + text.length } },
    content: text,
    id,
    kind: 'topic',
    title: text.slice(0, 20)
  };
}

const ARTICLE = [
  '---',
  'title: Why context matters',
  'author: Foliole',
  'tags: [aide]',
  '---',
  '# Why context matters',
  '',
  'Giving the model relevant context leads to better answers.',
  '',
  'More context is not always better. Noise hides what matters.',
  '',
  'In a typical chat, you decide what to share.'
].join('\n');

describe('buildAideAttachedContextCandidates', () => {
  it('attaches the editor selection of a plain Topic with its folder path', () => {
    const topic: AideContextNode = { anchor: null, content: 'Alpha line.\n\nBeta line chosen.\n\nGamma line.', id: 't1', kind: 'topic', title: 'Notes' };
    const text = attach({
      ancestors: [folder('f2', 'Inbox'), folder('f1', 'Library')],
      children: [],
      collections: { dives: ['Focus'], indexes: ['Reading'] },
      focus: topic,
      selectionText: 'Beta line chosen.'
    });
    expect(text).toContain('[Selected content]\nBeta line chosen.');
    expect(text).toContain('[Metadata]\ntitle: Notes');
    expect(text).toContain('Before: Alpha line.\nAfter: Gamma line.');
    expect(text).toContain('Folder: Library / Inbox\nIndexes: Reading\nDives: Focus');
  });

  it('restores the original sentence of an article highlight and skips tags and the repeated title', () => {
    const article: AideContextNode = { anchor: null, content: ARTICLE, id: 'art', kind: 'topic', title: 'Why context matters' };
    const highlight = highlightOf(ARTICLE, 'More context is not always better.');
    const text = attach({ ancestors: [article, folder('f', 'Articles')], children: [], collections: { dives: [], indexes: [] }, focus: highlight });
    expect(text).toContain('[Selected content]\nMore context is not always better.');
    expect(text).toContain('title: Why context matters\nauthor: Foliole');
    expect(text).not.toContain('tags');
    expect(text).not.toContain('[Outline]');
    expect(text).toContain('Before: Giving the model relevant context leads to better answers.');
    expect(text).toContain('After: In a typical chat, you decide what to share.');
  });

  it('marks the current chapter of a book and keeps the chapter chain first', () => {
    const body = ['# Book', '## Part One', '### Chapter 1', 'Opening text.', '### Chapter 2', 'The chosen line is here.', '## Part Two', '### Chapter 3', 'Later.'].join('\n');
    const book: AideContextNode = { anchor: null, content: body, id: 'b', kind: 'topic', title: 'Book' };
    const excerpt = highlightOf(body, 'The chosen line is here.', 'e1');
    const item: AideContextNode = { anchor: null, content: 'The chosen line is [...]', id: 'i1', kind: 'item', reveal: 'here', title: 'Cloze' };
    const text = attach({ ancestors: [book], children: [item], collections: { dives: [], indexes: [] }, focus: excerpt });
    expect(text).toContain('[Outline]\n- Part One\n  - Chapter 1\n  - Chapter 2 (current)\n- Part Two\n  - Chapter 3');
    expect(text).toContain('Item question: The chosen line is [...]\nItem answer: here');
  });

});

describe('buildAideAttachedContextCandidates for PDFs and excerpt chains', () => {
  it('uses the PDF highlight text and skips items that need a text body', () => {
    const pdf: AideContextNode = { anchor: null, content: '', id: 'pdf', kind: 'topic', title: 'Paper.pdf' };
    const highlight: AideContextNode = {
      anchor: { id: 'a-pdf', kind: 'highlight', locator: { originalText: 'A sentence from page four.', page: 4, x: 0.1, y: 0.2 } },
      content: 'A sentence from page four.\n※ Check the method.',
      id: 'ph',
      kind: 'topic',
      title: 'A sentence'
    };
    const text = attach({ ancestors: [pdf], children: [], collections: { dives: [], indexes: [] }, focus: highlight });
    expect(text).toContain('[Selected content]\nA sentence from page four.\nNote: Check the method.');
    expect(text).not.toContain('[Surrounding source text]');
    expect(text).not.toContain('[Outline]');
  });

  it('walks a deep excerpt chain back to the source and drops repeated excerpts', () => {
    const source: AideContextNode = { anchor: null, content: ARTICLE, id: 'src', kind: 'topic', title: 'Why context matters' };
    const level1 = highlightOf(ARTICLE, 'More context is not always better. Noise hides what matters.', 'l1');
    const level2: AideContextNode = {
      anchor: { id: 'a-l2', kind: 'highlight', locator: { from: 0, originalText: 'More context is not always better.', to: 34 } },
      content: 'More context is not always better.\n※ Key claim.',
      id: 'l2',
      kind: 'topic',
      title: 'Level 2'
    };
    const text = attach({ ancestors: [level1, source, folder('f', 'Articles')], children: [], collections: { dives: [], indexes: [] }, focus: level2 });
    expect(text).toContain('[Selected content]\nMore context is not always better.\nNote: Key claim.');
    expect(text).toContain('Source excerpt: Noise hides what matters.');
    expect(text).toContain('Before: Giving the model relevant context leads to better answers.');
    expect(text).toContain('Folder: Articles');
  });

  it('attaches nothing for a folder', () => {
    expect(buildAideAttachedContextCandidates({
      ancestors: [], children: [], collections: { dives: [], indexes: [] }, focus: folder('f', 'Folder')
    })).toEqual({});
  });
});
