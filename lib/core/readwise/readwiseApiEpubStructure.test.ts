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

it('keeps non-heading markers flat and deduplicates nested markers at the same text position', () => {
  const structure = prepareReadwiseApiEpubStructure(`
    <div data-rw-epub-toc="outer"><h1 data-rw-epub-toc="inner">Readable title</h1><p>First</p></div>
    <p data-rw-epub-toc="second">Second unit</p>
  `);

  expect(structure.markerCount).toBe(2);
  expect(structure.sections).toMatchObject([
    { headingLevel: 1, title: 'Readable title' },
    { headingLevel: null, title: 'Second unit' }
  ]);
});

it('keeps one useful marker without adding a level and drops an empty terminal marker', () => {
  const structure = prepareReadwiseApiEpubStructure(
    '<div data-rw-epub-toc="one">Only readable unit</div><div data-rw-epub-toc="empty"></div>'
  );

  expect(structure.markerCount).toBe(2);
  expect(structure.sections).toHaveLength(1);
  expect(structure.sections[0]).toMatchObject({ headingLevel: null, title: 'Only readable unit' });
});

it('reports missing toc markers and leaves structure materialization disabled', () => {
  const structure = prepareReadwiseApiEpubStructure('<h1>Ordinary heading</h1><p>Body</p><img src="body.jpg">');
  expect(structure.imageCount).toBe(1);
  expect(structure.sections).toEqual([]);
  expect(structure.degradedReason).toContain('markers were unavailable');
});
