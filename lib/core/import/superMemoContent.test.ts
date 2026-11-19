import { expect, it } from 'vitest';

import { convertSuperMemoContent } from './superMemoContent.js';

it('cleans native title and reference markup while preserving genuine headings, rules and links', () => {
  const label = '<span class="headers">Title:</span></B><span class="RefText"> Example article</span></FONT>';
  const reference = '<hr SuperMemo><SuperMemoReference><h5>#SuperMemo Reference:<br>#Title: Example article</SuperMemoReference>';
  expect(convertSuperMemoContent([label + '<p>Text</p>' + reference]).content).toBe('# Example article\n\nText');
  expect(convertSuperMemoContent([
    '<h1><strong>' + label + '</strong></h1><hr><p><a href="https://example.com">Link</a></p>' + reference
  ]).content).toBe('# **Example article**\n\n---\n\n[Link](https://example.com)');
  expect(convertSuperMemoContent([`<span>${label}</span><p>Text</p>${reference}`]).content).toBe('# Example article\n\nText');
  expect(convertSuperMemoContent(['<h1>Title: A literal heading</h1>']).content).toBe('# Title: A literal heading');
});

it('keeps inline images and unresolved source references in the Topic body and skips audio', () => {
  const { content } = convertSuperMemoContent([
    '<p>Before <img alt="Map" src="https://example.com/route (old).png"> after.</p>',
    '<img alt="Source map" src="file:///C:/Learning/map.png"><audio src="voice.mp3"></audio>'
  ]);
  expect(content).toContain('Before ![Map](https://example.com/route%20%28old%29.png) after.');
  expect(content).toContain('Source map · file:///C:/Learning/map.png');
  expect(content).not.toContain('voice.mp3');
});

it('puts resolved local images inline at their original position in the Topic body', () => {
  const source = 'file:///C:/Learning/maps/route.png';
  const destination = `asset://${'a'.repeat(64)}.png`;
  const { content } = convertSuperMemoContent(
    [`<p>Before <img alt="Route" src="${source}"> after.</p>`],
    new Map([[source, destination]])
  );
  expect(content).toBe(`Before ![Route](${destination}) after.`);
});

it('preserves paragraphs, lists and tables nested in exported custom containers', () => {
  const { content } = convertSuperMemoContent([
    '<ms-text-chunk><ms-cmark-node><p><custom-inline><strong>Review</strong></custom-inline></p>'
      + '<p>Introduction.</p><ul><ms-cmark-node><li>First point</li></ms-cmark-node></ul>'
      + '<table><tr><th>Key</th><th>Value</th></tr><tr><td>One</td><td>Two</td></tr></table>'
      + '</ms-cmark-node></ms-text-chunk>'
  ]);
  expect(content).toBe('**Review**\n\nIntroduction.\n\n- First point\n\n'
    + '| Key | Value |\n| --- | --- |\n| One | Two |');
});
