// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { convertHtmlToMarkdownCompatible } from '../../lib/core/import/htmlToMarkdownCompatible.js';

describe('convertHtmlToMarkdownCompatible', () => {
  it('preserves stable markdown structures from rich HTML', () => {
    const result = convertHtmlToMarkdownCompatible(`
      <h2>Imported Title</h2>
      <p>
        Plain <span style="font-weight: 700">Bold</span>
        <span style="font-style: italic">Italic</span>
        <span style="text-decoration: line-through">Gone</span>
        <a href="https://example.com">Link</a>
      </p>
      <ul><li>First</li><li>Second</li></ul>
      <blockquote><p>Quoted line</p></blockquote>
      <pre><code>const value = 1;</code></pre>
      <p><img src="https://example.com/image.png" alt="Preview" /></p>
    `);

    expect(result.content).toContain('## Imported Title');
    expect(result.content).toContain('Plain **Bold** *Italic* ~~Gone~~ [Link](https://example.com)');
    expect(result.content).toContain('- First');
    expect(result.content).toContain('- Second');
    expect(result.content).toContain('> Quoted line');
    expect(result.content).toContain('```\nconst value = 1;\n```');
    expect(result.content).toContain('![Preview](https://example.com/image.png)');
    expect(result.warnings).toEqual([]);
  });

  it('keeps degraded structures visible instead of dropping them silently', () => {
    const result = convertHtmlToMarkdownCompatible(`
      <table>
        <tr><th>Name</th><th>Value</th></tr>
        <tr><td>Alpha</td><td>Beta</td></tr>
      </table>
      <iframe src="https://example.com/embed"></iframe>
    `);

    expect(result.content).toContain('[Table degraded]');
    expect(result.content).toContain('Name | Value');
    expect(result.content).toContain('Alpha | Beta');
    expect(result.content).toContain('[Embedded iframe: https://example.com/embed]');
    expect(result.warnings).toEqual(['table_degraded', 'embedded_content_replaced']);
  });

  it('uses body content when given a full html document', () => {
    const result = convertHtmlToMarkdownCompatible(
      '<html><head><title>Ignored Title</title></head><body><h1>Chapter One</h1><p>Hello world.</p></body></html>'
    );

    expect(result.content).toBe('# Chapter One\n\nHello world.');
    expect(result.warnings).toEqual([]);
  });
});
