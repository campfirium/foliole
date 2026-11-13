import { expect, it } from 'vitest';

import { convertSuperMemoContent } from './superMemoContent.js';

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
