import { expect, it } from 'vitest';

import { renderEdgeReadingPage } from './edgeReadingPage.js';

it('keeps the entire article in the main page and links duplicate headings from a separate sidebar', () => {
  const paragraph = '沿河走到旧码头，望向远处的石桥。'.repeat(850);
  const html = renderEdgeReadingPage({
    title: '沿河走一趟',
    markdown: `---\nprivate: metadata\n---\n# 沿河走一趟\n\n## 一节\n\n${paragraph}\n\n## 一节\n\n最后一句。`,
    leafSvg: '<svg/>',
    language: 'zh-CN',
    contentsLabel: '目录'
  });
  const [sidebar, article] = html.split('<main>');
  expect(sidebar).toContain('<iframe');
  expect(sidebar).toContain('index.html#section-0');
  expect(sidebar).toContain('index.html#section-2');
  expect(sidebar).not.toContain(paragraph);
  expect(article).toContain('<h1>沿河走一趟</h1>');
  expect(article).toContain('<h3 id="section-0">一节</h3>');
  expect(article).toContain('<h3 id="section-2">一节</h3>');
  expect(article).toContain(paragraph);
  expect(article).toContain('最后一句。');
  expect(article).not.toContain('private: metadata');
});

it('escapes user titles and raw markup in the local reading page', () => {
  const html = renderEdgeReadingPage({
    title: '<script>alert(1)</script>',
    markdown: '## <img onerror=alert(1)>\n\n<script>alert(2)</script>',
    leafSvg: '<svg/>',
    language: 'en',
    contentsLabel: 'Contents'
  });
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img onerror=');
});
