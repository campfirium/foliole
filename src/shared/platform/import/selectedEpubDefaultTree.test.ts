// @vitest-environment node
import { expect, it } from 'vitest';

import { createTestZip } from '../../../../electron/ipc/testZipBuilder';

import { prepareSelectedEpubImport } from './selectedEpubImport';

type Toc = [title: string, href: string | null, children?: Toc[]];

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const page = (body: string, title = 'Sample Book') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;
const nav = (toc: Toc[]): string => `<ol>${toc.map(([title, href, children]) =>
  `<li>${href ? `<a href="${href}">${title}</a>` : `<span>${title}</span>`}${children ? nav(children) : ''}</li>`).join('')}</ol>`;

async function importBook(files: Record<string, string>, toc: Toc[], coverImage = false) {
  const names = Object.keys(files);
  const items = names.map((name, index) => `<item id="i${index}" href="${name}" media-type="application/xhtml+xml"/>`).join('');
  const cover = coverImage ? ' properties="cover-image"' : '';
  const opf = `<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Book</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}<item id="png" href="a.png" media-type="image/png"${cover}/></manifest><spine>${names.map((_, index) => `<itemref idref="i${index}"/>`).join('')}</spine></package>`;
  const zip = createTestZip([
    { name: 'mimetype', content: 'application/epub+zip' },
    { name: 'META-INF/container.xml', content: '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>' },
    { name: 'book.opf', content: opf },
    { name: 'nav.xhtml', content: `<html><body><nav epub:type="toc">${nav(toc)}</nav></body></html>` },
    { name: 'a.png', content: png },
    ...names.map((name) => ({ name, content: files[name] ?? '' }))
  ].map((entry) => ({ ...entry, compression: 'store' as const })));
  const result = await prepareSelectedEpubImport(new Uint8Array(zip), 'sample.epub');
  const depths = new Map<string, number>();
  const tree = result.epubBook.chapters.map((node) => {
    const depth = node.parentKey ? (depths.get(node.parentKey) ?? 0) + 1 : 0;
    depths.set(node.key, depth);
    return [depth, node.title, node.content.replace(/asset:\/\/[^)]+/g, 'asset')] as const;
  });
  return { root: result.content.replace(/asset:\/\/[^)]+/g, 'asset'), tree };
}

const one = page('<h1>One</h1><p>Body one.</p>');
const oneBody = '# One\n\nBody one.';

it('keeps one empty node for part pages and linkless toc groups', async () => {
  const { tree } = await importBook(
    { 'part.xhtml': page('<h1>Part One</h1>'), 'c1.xhtml': one },
    [['Part One', 'part.xhtml', [['One', 'c1.xhtml']]], ['Group', null, [['One again', 'c1.xhtml']]]]
  );

  expect(tree.slice(0, 3)).toEqual([[0, 'Part One', ''], [1, 'One', oneBody], [0, 'Group', '']]);
});

it('keeps a standalone title page as an empty node and keeps a subtitle that adds text', async () => {
  const { tree } = await importBook(
    { 'part.xhtml': page('<h1>Part One</h1>'), 'sub.xhtml': page('<h1>Part Two</h1><h2>The early years</h2>') },
    [['Part One', 'part.xhtml'], ['Part Two', 'sub.xhtml']]
  );

  expect(tree).toEqual([[0, 'Part One', ''], [0, 'Part Two', '# Part Two\n\n## The early years']]);
});

it.each([
  ['two anchors', '<h2 id="a">Alpha</h2><p>A.</p><h2 id="b">Beta</h2><p>B.</p>',
    [['Alpha', 'c1.xhtml#a'], ['Beta', 'c1.xhtml#b']], [[1, 'Alpha', '## Alpha\n\nA.'], [1, 'Beta', '## Beta\n\nB.']]],
  ['one anchor', '<h2 id="a">Alpha</h2><p>A.</p>', [['Alpha', 'c1.xhtml#a']], [[1, 'Alpha', '## Alpha\n\nA.']]]
] as const)('keeps the intro on the chapter node and each section once with %s', async (_name, sections, children, rows) => {
  const { tree } = await importBook(
    { 'c1.xhtml': page(`<h1>Chapter One</h1><p>Intro text.</p>${sections}`) },
    [['Chapter One', 'c1.xhtml', children as unknown as Toc[]]]
  );

  expect(tree).toEqual([[0, 'Chapter One', '# Chapter One\n\nIntro text.'], ...rows]);
});

it('leaves the chapter node empty when there is no intro', async () => {
  const { tree } = await importBook(
    { 'c1.xhtml': page('<h1>Chapter One</h1><h2 id="a">Alpha</h2><p>A.</p>') },
    [['Chapter One', 'c1.xhtml', [['Alpha', 'c1.xhtml#a']]]]
  );

  expect(tree).toEqual([[0, 'Chapter One', ''], [1, 'Alpha', '## Alpha\n\nA.']]);
});

it('merges an opening page holding only the declared cover image into the root', async () => {
  const { root, tree } = await importBook(
    { 'front.xhtml': page('<img src="a.png"/>'), 'c1.xhtml': one, 'plate.xhtml': page('<img src="a.png"/>') },
    [['Front', 'front.xhtml'], ['One', 'c1.xhtml'], ['Plate', 'plate.xhtml']],
    true
  );

  expect(root).toContain('![](asset)');
  expect(tree.map(([, title]) => title)).toEqual(['One', 'Plate']);
});

it('imports images wrapped in svg', async () => {
  const svg = '<div><svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="a.png"/></svg></div>';
  const { tree } = await importBook({ 'c1.xhtml': one, 'plate.xhtml': page(svg) }, [['One', 'c1.xhtml'], ['Plate', 'plate.xhtml']]);

  expect(tree[1]).toEqual([0, 'Plate', '![](asset)']);
});

it('names pages from their own headings and skips blank pages when there is no toc', async () => {
  const { tree } = await importBook(
    { 'c1.xhtml': one, 'blank.xhtml': page('<p> </p>'), 'plate.xhtml': page('<img src="a.png"/>') },
    []
  );

  expect(tree).toEqual([[0, 'One', oneBody], [0, 'Chapter 3', '![](asset)']]);
});

it('keeps a blank page listed in the toc as an empty node', async () => {
  const { tree } = await importBook({ 'blank.xhtml': page('<p> </p>'), 'c1.xhtml': one }, [['Notes', 'blank.xhtml'], ['One', 'c1.xhtml']]);

  expect(tree).toEqual([[0, 'Notes', ''], [0, 'One', oneBody]]);
});
