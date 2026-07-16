import { expect, it } from 'vitest';

import { convertWordPressMarkdownToHtml } from './wordpressMarkdownHtml.js';

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
