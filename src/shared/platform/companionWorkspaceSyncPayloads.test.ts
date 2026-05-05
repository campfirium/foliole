import { expect, it } from 'vitest';

import { normalizeReadableArticlePayload } from './companionWorkspaceSyncPayloads';

it('normalizes missing companion readable article body status', () => {
  expect(normalizeReadableArticlePayload({
    readable_article: {
      content: '',
      content_status: 'missing',
      node_id: 'topic-1',
      title: 'Topic'
    }
  })).toMatchObject({
    bodyStatus: 'missing',
    content: '',
    nodeId: 'topic-1',
    title: 'Topic'
  });
});

it('normalizes empty companion readable article body status', () => {
  expect(normalizeReadableArticlePayload({
    readable_article: {
      content: '',
      content_status: 'empty',
      node_id: 'topic-1',
      title: 'Topic'
    }
  })).toMatchObject({
    bodyStatus: 'empty',
    content: '',
    nodeId: 'topic-1',
    title: 'Topic'
  });
});

it('normalizes fetching and failed companion readable article body status', () => {
  expect(normalizeReadableArticlePayload({
    readable_article: {
      content: '',
      content_status: 'fetching',
      node_id: 'topic-1',
      title: 'Topic'
    }
  })).toMatchObject({
    bodyStatus: 'fetching'
  });
  expect(normalizeReadableArticlePayload({
    readable_article: {
      content: '',
      content_status: 'failed',
      node_id: 'topic-1',
      title: 'Topic'
    }
  })).toMatchObject({
    bodyStatus: 'failed'
  });
});
