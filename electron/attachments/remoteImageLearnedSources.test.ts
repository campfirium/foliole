// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { loadJsonSetting, saveJsonSetting } = vi.hoisted(() => ({
  loadJsonSetting: vi.fn(),
  saveJsonSetting: vi.fn()
}));

vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting,
  saveJsonSetting
}));

import {
  forgetRemoteImageLearnedSource,
  learnRemoteImageSourceOrigin,
  loadRemoteImageLearnedSource,
  REMOTE_IMAGE_LEARNED_SOURCES_KEY
} from './remoteImageLearnedSources.js';

beforeEach(() => {
  vi.clearAllMocks();
  loadJsonSetting.mockReturnValue(null);
});

it('normalizes a source website article URL into an origin and stores it by image host', () => {
  expect(learnRemoteImageSourceOrigin('https://cdn.example/path/image.png', 'https://source.example/article?id=1')).toMatchObject({
    imageHost: 'cdn.example',
    sourceOrigin: 'https://source.example/',
    status: 'saved'
  });
  expect(saveJsonSetting).toHaveBeenCalledWith(
    REMOTE_IMAGE_LEARNED_SOURCES_KEY,
    {
      entries: {
        'cdn.example': {
          sourceOrigin: 'https://source.example/',
          updatedAt: expect.any(String)
        }
      },
      version: 1
    }
  );
});

it('rejects invalid image urls and non-http source websites', () => {
  expect(learnRemoteImageSourceOrigin('file:///tmp/image.png', 'https://source.example/')).toMatchObject({
    imageHost: null,
    sourceOrigin: null,
    status: 'invalid'
  });
  expect(learnRemoteImageSourceOrigin('https://cdn.example/image.png', 'file:///tmp/source.md')).toMatchObject({
    imageHost: 'cdn.example',
    sourceOrigin: null,
    status: 'invalid'
  });
  expect(saveJsonSetting).not.toHaveBeenCalled();
});

it('loads and forgets the learned source for one image host', () => {
  loadJsonSetting.mockReturnValue({
    entries: {
      'cdn.example': { sourceOrigin: 'https://source.example/article', updatedAt: '2026-05-18T00:00:00.000Z' },
      'other.example': { sourceOrigin: 'https://other.example/', updatedAt: '2026-05-18T00:00:00.000Z' }
    },
    version: 1
  });

  expect(loadRemoteImageLearnedSource('https://cdn.example/path/image.png')).toEqual({
    imageHost: 'cdn.example',
    sourceOrigin: 'https://source.example/'
  });
  expect(forgetRemoteImageLearnedSource('https://cdn.example/path/image.png')).toEqual({
    imageHost: 'cdn.example',
    status: 'forgotten'
  });
  expect(saveJsonSetting).toHaveBeenCalledWith(
    REMOTE_IMAGE_LEARNED_SOURCES_KEY,
    {
      entries: {
        'other.example': { sourceOrigin: 'https://other.example/', updatedAt: '2026-05-18T00:00:00.000Z' }
      },
      version: 1
    }
  );
});
