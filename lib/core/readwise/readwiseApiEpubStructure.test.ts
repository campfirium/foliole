// @vitest-environment node

import { expect, it } from 'vitest';

import { prepareReadwiseApiEpubStructure } from './readwiseApiEpubStructure.js';

it('builds ordered heading sections while leaving unmarked headings in their body intervals', () => {
  const chapters = Array.from({ length: 13 }, (_, chapterIndex) => {
    const sectionCount = chapterIndex === 5 ? 8 : chapterIndex < 5 ? 6 : 5;
    const sections = Array.from({ length: sectionCount }, (_, sectionIndex) =>
      `<h2 data-rw-epub-toc="section-${chapterIndex}-${sectionIndex}">Section ${chapterIndex + 1}.${sectionIndex + 1}</h2>`
      + `<p>Body ${chapterIndex}-${sectionIndex}</p>`
      + (sectionIndex === 0 && chapterIndex < 13 ? `<h3>Unlisted ${chapterIndex + 1}</h3>` : '')
    ).join('');
    return `<h1 data-rw-epub-toc="chapter-${chapterIndex}">Chapter ${chapterIndex + 1}: Title ${chapterIndex + 1}</h1>${sections}`;
  }).join('') + Array.from({ length: 4 }, (_, index) => `<h3>Trailing unlisted ${index}</h3>`).join('');

  const structure = prepareReadwiseApiEpubStructure(
    `<html><body><p>Preface</p><img src="cover.jpg">${chapters}</body></html>`
  );

  expect(structure.imageCount).toBe(1);
  expect(structure.markerCount).toBe(86);
  expect(structure.sections.filter((section) => section.headingLevel === 1)).toHaveLength(13);
  expect(structure.sections.filter((section) => section.headingLevel === 2)).toHaveLength(73);
  expect(structure.sections.map((section) => section.title)).not.toContain('Unlisted 1');
  expect(structure.sections.map((section) => section.content).join('\n')).toContain('### Unlisted 1');
  expect(structure.rootBody).toBe('Preface\n\n![](cover.jpg)');
});

it('keeps block markers and rejects nested duplicate markers at the same position', () => {
  const structure = prepareReadwiseApiEpubStructure(`
    <div data-rw-epub-toc="outer"><h1 data-rw-epub-toc="inner">Readable title</h1><p>First</p></div>
    <p data-rw-epub-toc="second">Second unit</p>
  `);

  expect(structure.markerCount).toBe(2);
  expect(structure.sections).toMatchObject([
    { headingLevel: 1, title: 'Readable title' },
    { headingLevel: 1, title: 'Second unit' }
  ]);
  expect(structure.sections[0]?.content).toContain('First');
});

it('normalizes h2 plus h4 to two natural levels', () => {
  const structure = prepareReadwiseApiEpubStructure(`
    <h2 data-rw-epub-toc="chapter">Chapter</h2><p>Intro</p>
    <h4 data-rw-epub-toc="section">Section</h4><p>Body</p>
  `);

  expect(structure.sections.map((section) => section.naturalLevel)).toEqual([1, 2]);
});

it('keeps inline footnote markers inside the current structural body', () => {
  const structure = prepareReadwiseApiEpubStructure(`
    <h1 data-rw-epub-toc="chapter">Chapter</h1><p>Body<a data-rw-epub-toc="note">[1]</a>tail.</p>
  `);

  expect(structure.sections).toHaveLength(1);
  expect(structure.sections[0]?.content).toContain('[1]tail.');
  expect(structure.candidates?.at(-1)).toMatchObject({ accepted: false, reason: 'rejected-inline-marker' });
});

it('uses repeated block signatures and DOM depth to recover three natural levels', () => {
  const structure = prepareReadwiseApiEpubStructure(`
    <h1 data-rw-epub-toc="volume-1">Volume 1</h1>
    <div class="chapter" data-rw-epub-toc="chapter-1">Chapter 1</div>
    <div><div class="section" data-rw-epub-toc="section-1">Section 1</div></div>
    <div class="chapter" data-rw-epub-toc="chapter-2">Chapter 2</div>
    <div><div class="section" data-rw-epub-toc="section-2">Section 2</div></div>
    <h1 data-rw-epub-toc="volume-2">Volume 2</h1>
  `);

  expect(structure.sections.map((section) => section.naturalLevel)).toEqual([1, 2, 3, 2, 3, 1]);
});

it('rejects table-of-contents links inside navigation instead of duplicating their targets', () => {
  const structure = prepareReadwiseApiEpubStructure(`
    <nav><p data-rw-epub-toc="copy">Chapter link</p></nav>
    <h1 data-rw-epub-toc="target">Chapter</h1><p>Body</p>
  `);

  expect(structure.sections).toHaveLength(1);
  expect(structure.candidates?.[0]).toMatchObject({ accepted: false, reason: 'rejected-navigation-copy' });
});

it('skips empty ordinary toc markers instead of creating blank sections', () => {
  const structure = prepareReadwiseApiEpubStructure(
    '<div data-rw-epub-toc="empty"></div>'
  );

  expect(structure.markerCount).toBe(0);
  expect(structure.sections).toEqual([]);
  expect(structure.degradedReason).toContain('markers were unavailable');
});

it('reports missing toc markers and leaves structure materialization disabled', () => {
  const structure = prepareReadwiseApiEpubStructure('<h1>Ordinary heading</h1><p>Body</p><img src="body.jpg">');
  expect(structure.imageCount).toBe(1);
  expect(structure.sections).toEqual([]);
  expect(structure.degradedReason).toContain('markers were unavailable');
});
