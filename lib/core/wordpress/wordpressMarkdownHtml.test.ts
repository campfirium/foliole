import { expect, it } from 'vitest';

import { convertWordPressMarkdownToBlocks, convertWordPressMarkdownToHtml } from './wordpressMarkdownHtml.js';

it('converts common Foliole Markdown to escaped WordPress HTML', () => {
  const markdown = [
    '## Heading',
    '',
    'A **strong** and *quiet* [link](https://example.com).',
    '',
    '- one',
    '- two',
    '',
    '> quote',
    '',
    '~~~js',
    '<unsafe>',
    '~~~'
  ].join('\n');

  const html = convertWordPressMarkdownToHtml(markdown);
  expect(html).toContain('<h2>Heading</h2>');
  expect(html).toContain('<strong>strong</strong>');
  expect(html).toContain('<em>quiet</em>');
  expect(html).toContain('<a href="https://example.com/">link</a>');
  expect(html).toContain('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
  expect(html).toContain('<blockquote><p>quote</p></blockquote>');
  expect(html).toContain('<pre><code class="language-js">&lt;unsafe&gt;</code></pre>');
});

it('keeps unsafe HTML and non-web image targets inert', () => {
  const html = convertWordPressMarkdownToHtml('<script>alert(1)</script>\n\n![local](file:///tmp/image.png)');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('local');
});

it('exposes complete top-level blocks and can demote headings for article chrome', () => {
  const markdown = '# Title\n\nFirst **segment**.\n\n- second\n- block';
  const blocks = convertWordPressMarkdownToBlocks(markdown, 1);

  expect(blocks.map((block) => block.kind)).toEqual(['ATXHeading1', 'Paragraph', 'BulletList']);
  expect(blocks[0]).toMatchObject({ html: '<h2>Title</h2>', text: 'Title' });
  expect(blocks[1]).toMatchObject({ html: '<p>First <strong>segment</strong>.</p>', text: 'First segment.' });
  expect(convertWordPressMarkdownToHtml(markdown, 1)).not.toContain('<h1>');
});

it('preserves soft line breaks only when the publishing surface requests them', () => {
  const markdown = 'First line\nSecond **line**';

  expect(convertWordPressMarkdownToHtml(markdown)).toBe('<p>First line\nSecond <strong>line</strong></p>');
  expect(convertWordPressMarkdownToBlocks(markdown, 0, { preserveSoftBreaks: true })[0]?.html)
    .toBe('<p>First line<br />Second <strong>line</strong></p>');
});
