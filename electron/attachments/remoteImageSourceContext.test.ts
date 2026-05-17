// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { loadNodeSourceDetails, loadRemoteImageLearnedSource } = vi.hoisted(() => ({
  loadRemoteImageLearnedSource: vi.fn(),
  loadNodeSourceDetails: vi.fn()
}));

vi.mock('../database/nodeSourceDetails.js', () => ({
  loadNodeSourceDetails
}));

vi.mock('./remoteImageLearnedSources.js', () => ({
  loadRemoteImageLearnedSource,
  normalizeRemoteImageSourceOrigin: (value: string | null | undefined) => {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? `${parsed.origin}/` : null;
    } catch {
      return null;
    }
  }
}));

import {
  resolveRemoteImageSourceContext,
  resolveRemoteImageSourceOriginForNode
} from './remoteImageSourceContext.js';

beforeEach(() => {
  vi.clearAllMocks();
  loadRemoteImageLearnedSource.mockReturnValue({ imageHost: 'cdn.example', sourceOrigin: null });
});

it('resolves source origin from import source without exposing path or query', () => {
  loadNodeSourceDetails.mockReturnValue({
    importRuns: [],
    importSource: {
      source_locator: 'https://source.example/article?id=1#section'
    }
  });

  expect(resolveRemoteImageSourceOriginForNode('node-1')).toBe('https://source.example/');
});

it('falls back to import runs and ignores non-http locators', () => {
  loadNodeSourceDetails.mockReturnValue({
    importRuns: [
      { source_locator: '/Users/me/article.md' },
      { source_locator: 'https://archive.example/path' }
    ],
    importSource: {
      source_locator: 'file:///Users/me/article.md'
    },
    sourceNodeContent: ''
  });

  expect(resolveRemoteImageSourceOriginForNode('node-1')).toBe('https://archive.example/');
});

it('falls back to frontmatter url when import locators are local files', () => {
  loadNodeSourceDetails.mockReturnValue({
    importRuns: [{ source_locator: 'D:\\Articles\\saved.md' }],
    importSource: {
      source_locator: 'D:\\Articles\\saved.md'
    },
    sourceNodeContent: [
      '---',
      'author: Example',
      'url: https://source.example/article?id=1',
      '---',
      '# Title'
    ].join('\n')
  });

  expect(resolveRemoteImageSourceOriginForNode('node-1')).toBe('https://source.example/');
});

it('returns null when no trusted source URL exists', () => {
  loadNodeSourceDetails.mockReturnValue({
    importRuns: [{ source_locator: '/Users/me/article.md' }],
    importSource: null,
    sourceNodeContent: '---\nurl: file:///Users/me/article.md\n---'
  });

  expect(resolveRemoteImageSourceOriginForNode('node-1')).toBeNull();
  expect(resolveRemoteImageSourceOriginForNode(null)).toBeNull();
});

it('uses learned source only when the node has no source origin', () => {
  loadNodeSourceDetails.mockReturnValue({
    importRuns: [],
    importSource: null,
    sourceNodeContent: ''
  });
  loadRemoteImageLearnedSource.mockReturnValue({
    imageHost: 'cdn.example',
    sourceOrigin: 'https://learned.example/'
  });

  expect(resolveRemoteImageSourceContext('node-1', 'https://cdn.example/image.png')).toEqual({
    imageHost: 'cdn.example',
    learnedSourceOrigin: 'https://learned.example/',
    source: 'learned',
    sourceOrigin: 'https://learned.example/'
  });
});

it('prefers the node source origin over a learned source', () => {
  loadNodeSourceDetails.mockReturnValue({
    importRuns: [],
    importSource: { source_locator: 'https://source.example/article' },
    sourceNodeContent: ''
  });
  loadRemoteImageLearnedSource.mockReturnValue({
    imageHost: 'cdn.example',
    sourceOrigin: 'https://learned.example/'
  });

  expect(resolveRemoteImageSourceContext('node-1', 'https://cdn.example/image.png')).toEqual({
    imageHost: 'cdn.example',
    learnedSourceOrigin: 'https://learned.example/',
    source: 'node',
    sourceOrigin: 'https://source.example/'
  });
});
