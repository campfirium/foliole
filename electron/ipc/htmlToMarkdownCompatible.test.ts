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

describe('convertHtmlToMarkdownCompatible URL hygiene', () => {
  it('drops unsafe link and image URL protocols while keeping readable text', () => {
    const result = convertHtmlToMarkdownCompatible(`
      <p><a href="javascript:alert(1)">Script link</a></p>
      <p><a href="file:///tmp/source.md">Local file</a></p>
      <p><img src="javascript:alert(1)" alt="Bad preview" /></p>
      <p><img src="file:///tmp/image.png" alt="Local preview" /></p>
      <p><a href="chapter.xhtml#c1">Chapter link</a></p>
      <p><img src="https://example.com/image.png" alt="Remote preview" /></p>
    `);

    expect(result.content).toContain('Script link');
    expect(result.content).toContain('Local file');
    expect(result.content).toContain('Bad preview');
    expect(result.content).toContain('Local preview');
    expect(result.content).toContain('[Chapter link](chapter.xhtml#c1)');
    expect(result.content).toContain('![Remote preview](https://example.com/image.png)');
    expect(result.content).not.toContain('javascript:');
    expect(result.content).not.toContain('file:///');
  });
});

describe('convertHtmlToMarkdownCompatible footnotes', () => {
  it('keeps pure superscript footnote markers visible instead of flattening them into body text', () => {
    const result = convertHtmlToMarkdownCompatible(`
      <p>Weight<sup class="calibre8">1</sup> matters.</p>
    `);

    expect(result.content).toContain('Weight^[1] matters.');
    expect(result.warnings).toEqual([]);
  });

  it('pairs href and id based epub footnote references with their note body', () => {
    const result = convertHtmlToMarkdownCompatible(`
      <p>Weight<sup><a href="part0010.html#ref9" id="annot9">1</a></sup> matters.</p>
      <p><a href="part0007.html#annot9" id="ref9">1</a>1 pound is about 0.454 kilograms. — Editor note</p>
    `);

    expect(result.content).toContain('Weight^[1]{1 pound is about 0.454 kilograms. — Editor note} matters.');
    expect(result.content).toContain('^[1] 1 pound is about 0.454 kilograms. — Editor note');
    expect(result.warnings).toEqual([]);
  });

  it('keeps unmatched footnote-like references readable while leaving ordinary links alone', () => {
    const result = convertHtmlToMarkdownCompatible(`
      <p>Weight<a href="part0010.html#missing-note" id="annot9">1</a> still reads clearly.</p>
      <p>Chapter jump <a href="chapter.xhtml#c1">1</a> stays a normal link.</p>
    `);

    expect(result.content).toContain('Weight^[1] still reads clearly.');
    expect(result.content).toContain('Chapter jump [1](chapter.xhtml#c1) stays a normal link.');
    expect(result.content).not.toContain('Chapter jump ^[1]');
    expect(result.warnings).toEqual([]);
  });
});
