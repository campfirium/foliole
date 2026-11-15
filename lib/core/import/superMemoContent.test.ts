import { expect, it } from 'vitest';

import { folioleMarkdownParser } from '../markdown/folioleMarkdownParser.js';

import { convertSuperMemoContent } from './superMemoContent.js';

it('keeps exported reference labels literal alongside real headings and links', () => {
  const { content } = convertSuperMemoContent([
    '<h2>Article</h2><p>Body</p><hr SuperMemo><SuperMemoReference><h5>'
      + '<font style="color: transparent">#SuperMemo Reference:</font><br>'
      + '<font class="reference">#Title: An example<br># Link: '
      + '<a href="https://example.com/article#source">Original</a></font></SuperMemoReference>'
  ]);
  const syntax = folioleMarkdownParser.parse(content).toString();
  expect(syntax.match(/ATXHeading\d/g)).toEqual(['ATXHeading2']);
  expect(syntax).toContain('Link(');
  expect(content).toContain('\\#SuperMemo Reference:\n\\#Title: An example\n'
    + '\\# Link: [Original](https://example.com/article#source)');
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
