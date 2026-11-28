import { expect, it } from 'vitest';

import { createPreparedDesktopTextImport } from './fingerprint.js';
import { convertHtmlToMarkdownCompatible } from './htmlToMarkdownCompatible.js';
import { splitImportBody } from './importBodySegments.js';
import { collectDataImageSourceSpans } from './importDataImageNodes.js';
import { localizeImportDataImages, UNIMPORTABLE_IMAGE_PLACEHOLDER } from './importDataImages.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=';
const PNG_URL = `data:image/png;base64,${PNG}`;

function localize(content: string) {
  return localizeImportDataImages(createPreparedDesktopTextImport({
    content, degradedReason: null, fileName: 'a.md', filePath: '/a.md',
    importedAt: '2026-11-28T00:00:00.000Z', kind: 'markdown'
  }));
}

function run(content: string) {
  const { prepared, images } = localize(content);
  return { content: prepared.content, url: images[0] ? `asset://${images[0].storageKey}` : '', images };
}

it('inlines every reference form and drops the definition nobody else uses', () => {
  const { content, url, images } = run(`![One][pic] ![pic][] ![pic]\n\n[pic]: <${PNG_URL}> "Title"\n\nafter`);
  expect(images).toHaveLength(1);
  expect(content).toBe(`![One](${url} "Title") ![pic](${url} "Title") ![pic](${url} "Title")\n\nafter`);
});

it('keeps a definition that a link still uses and removes a quoted one', () => {
  const linked = run(`![One][pic] and [the file][pic]\n\n[pic]: ${PNG_URL}`);
  expect(linked.content).toBe(`![One](${linked.url}) and [the file][pic]\n\n[pic]: ${PNG_URL}`);
  const quoted = run(`> ![One][pic]\n>\n> [pic]: ${PNG_URL}\n`);
  expect(quoted.content).toBe(`> ![One](${quoted.url})\n>\n`);
});

it('turns a bare img into a visible image with alt, title and width', () => {
  const folded = `data:image/png;base64,${PNG.slice(0, 20)}\n  ${PNG.slice(20)}`;
  const { content, url } = run(`a <img class="x" src="${folded}" alt="A &amp; [B]" title='T "q"' width="320px"> b\n\n<img src='${PNG_URL}' width="50%">`);
  expect(content).toBe(`a ![A & \\[B\\]|320](${url} "T \\"q\\"") b\n\n![](${url})`);
});

it('gives an img wrapped in an HTML block its own paragraph', () => {
  const { content, url } = run(`<p align="center">\n<img src="${PNG_URL}">\n</p>`);
  expect(content).toBe(`<p align="center">\n\n![](${url})\n</p>`);
});

it('leaves code, comments and raw HTML samples untouched', () => {
  const content = [
    `\`<img src="${PNG_URL}">\``,
    `\`\`\`md\n![a][pic]\n<img src="${PNG_URL}">\n\`\`\``,
    `    <img src="${PNG_URL}">`,
    `<!-- <img src="${PNG_URL}"> -->`,
    `<pre>\n<img src="${PNG_URL}">\n</pre>`,
    `[pic]: ${PNG_URL}`
  ].join('\n\n');
  const result = run(content);
  expect(result.images).toEqual([]);
  expect(result.content).toBe(content);
});

it('keeps small unusable images whole and replaces ones that cannot fit in a body part', () => {
  const small = '<img src="data:image/png;base64,cG5n">\n\n![r][bad]\n\n[bad]: data:image/png;base64,cG5n';
  expect(run(small).content).toBe(small);
  const big = `data:image/svg+xml;base64,${'A'.repeat(1_100_000)}`;
  const { prepared } = localize(`x <img src="${big}"> y\n\n![r][big]\n\n[big]: ${big}\n\nz`);
  expect(prepared.content).toBe(`x ${UNIMPORTABLE_IMAGE_PLACEHOLDER} y\n\n${UNIMPORTABLE_IMAGE_PLACEHOLDER}\n\nz`);
  expect(prepared.degradedReason).toBe('Inline images could not be imported: 2');
});

it('converts a multi-megabyte img and reference', () => {
  const big = `data:image/png;base64,${Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(3_000_000, 1)]).toString('base64')}`;
  for (const body of [`<img src="${big}">`, `![a][r]\n\n[r]: ${big}`]) {
    const result = run(body);
    expect(result.images).toHaveLength(1);
    expect(result.content).not.toContain('base64');
  }
});

it('keeps highlight text in step without touching a longer image that starts the same way', () => {
  const input = createPreparedDesktopTextImport({
    content: `![pic] <img src="${PNG_URL}">\n\n[pic]: ${PNG_URL}`, degradedReason: null, fileName: 'a.md',
    filePath: '/a.md', importedAt: '2026-11-28T00:00:00.000Z', kind: 'markdown'
  });
  const text = `![pic] <img src="${PNG_URL}"> ![pic](https://example.invalid/p.png)`;
  const { prepared, images } = localizeImportDataImages({
    ...input, matchedHighlights: [{ content: text, label: null, locatorText: text }]
  });
  const url = `asset://${images[0]!.storageKey}`;
  expect(prepared.matchedHighlights![0]!.content)
    .toBe(`![pic](${url}) ![](${url}) ![pic](https://example.invalid/p.png)`);
});

it('converts an img with a folded source arriving as HTML', () => {
  const markdown = convertHtmlToMarkdownCompatible(`<p><img src="data:image/png;base64,${PNG.slice(0, 20)}\n${PNG.slice(20)}" alt="H"></p>`);
  const { content, url } = run(markdown.content);
  expect(content).toContain(`![H](${url})`);
});

it('protects a kept reference definition and img from body splitting', () => {
  const content = `${'x'.repeat(60)}\n<img src="data:image/png;base64,cG5n">\n\n[bad]: data:image/png;base64,cG5n`;
  const spans = collectDataImageSourceSpans(content);
  for (const segment of splitImportBody(content, 80, spans).slice(1)) {
    expect(spans.some(span => segment.from > span.from && segment.from < span.to)).toBe(false);
  }
  expect(spans).toHaveLength(2);
});
